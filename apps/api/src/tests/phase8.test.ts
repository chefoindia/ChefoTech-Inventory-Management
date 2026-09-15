import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, BASE, registerTenant, auth, addMember, type TestTenant } from './helpers';
import { createTabletProduct, unitIds } from './catalog.test';
import { postOpening } from './inventory.test';

const key = () => `k-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
const hdr = (t: TestTenant, token = t.accessToken) => ({ ...auth(token), 'X-Outlet-Id': t.outletId });

async function seedSales(t: TestTenant) {
  const p = await createTabletProduct(t, { requiresPrescription: false, stockRules: { reorderLevelBase: 30, minStockBase: 10, maxStockBase: 500 } });
  const u = await unitIds(t);
  await postOpening(t, p.id, u.strip, 4, { batchNumber: 'B1', expiryDate: inDays(20), mrpMinor: 18_500, purchasePriceMinor: 13_200 });
  const cust = (await request(app).post(`${BASE}/customers`).set(auth(t.accessToken)).send({ name: 'Ravi', phone: '9000000011', creditLimitMinor: 100_000 })).body.data;
  const s1 = await request(app).post(`${BASE}/sales`).set(hdr(t)).set('Idempotency-Key', key()).send({ lines: [{ productId: p.id, unitId: u.strip, qty: 1 }], payments: [{ method: 'cash', amountMinor: 18_500 }] });
  const s2 = await request(app).post(`${BASE}/sales`).set(hdr(t)).set('Idempotency-Key', key()).send({ customerId: cust.id, lines: [{ productId: p.id, unitId: u.strip, qty: 2 }], payments: [{ method: 'upi', amountMinor: 10_000 }], creditMinor: 27_000, dueDate: inDays(-2) });
  if (s1.status !== 201 || s2.status !== 201) throw new Error(JSON.stringify([s1.body, s2.body]));
  return { p, u, cust };
}

describe('dashboard & reports', () => {
  it('summarises sales, receivables, inventory and alerts', async () => {
    const t = await registerTenant();
    await seedSales(t);
    const res = await request(app).get(`${BASE}/dashboard/summary`).set(hdr(t));
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.sales.invoices).toBe(2);
    expect(d.sales.revenueMinor).toBe(55_500);
    expect(d.receivables.outstandingMinor).toBe(27_000);
    expect(d.receivables.overdueMinor).toBe(27_000);
    expect(d.inventory.lowStock).toBe(1); // 10 tablets left ≤ reorder 30
    expect(d.inventory.nearExpiry).toBe(10);
    expect(d.profit.grossProfitMinor).toBeGreaterThan(0);
    expect(d.trend.length).toBeGreaterThan(0);
    expect(d.paymentMix.map((m: { method: string }) => m.method).sort()).toEqual(['cash', 'upi']);
    expect(d.topProducts[0].name).toBe('Montek LC');
    expect(d.alerts.map((a: { type: string }) => a.type)).toEqual(expect.arrayContaining(['lowStock', 'nearExpiry', 'overdue']));

    const staff = await addMember(t, 'billing_staff');
    const restricted = await request(app).get(`${BASE}/dashboard/summary`).set(hdr(t, staff.accessToken));
    expect(restricted.status).toBe(403);
  });

  it('runs the report catalogue with permission gates and exports CSV', async () => {
    const t = await registerTenant();
    await seedSales(t);
    const cat = await request(app).get(`${BASE}/reports/catalogue`).set(auth(t.accessToken));
    expect(cat.body.data.length).toBeGreaterThan(25);

    const daily = await request(app).get(`${BASE}/reports/sales.daily`).set(hdr(t));
    expect(daily.status).toBe(200);
    expect(daily.body.data.rows).toHaveLength(1);
    expect(daily.body.data.rows[0].revenue).toBe(55_500);

    const gst = await request(app).get(`${BASE}/reports/finance.gst`).set(hdr(t));
    expect(gst.body.data.rows[0].rate).toBe(12);
    expect(gst.body.data.totals.outputTax).toBeGreaterThan(0);

    const outstanding = await request(app).get(`${BASE}/reports/finance.outstanding`).set(hdr(t));
    expect(outstanding.body.data.rows[0].total).toBe(27_000);
    expect(outstanding.body.data.rows[0].d0_30).toBe(27_000);

    const profit = await request(app).get(`${BASE}/reports/finance.profit`).set(hdr(t));
    expect(profit.body.data.rows[0].profit).toBeGreaterThan(0);

    const csv = await request(app).get(`${BASE}/reports/sales.byProduct?format=csv`).set(hdr(t));
    expect(csv.status).toBe(200);
    expect(csv.text).toContain('Montek LC');

    const accountant = await addMember(t, 'accountant');
    expect((await request(app).get(`${BASE}/reports/finance.profit`).set(hdr(t, accountant.accessToken))).status).toBe(200);
    const pharmacist = await addMember(t, 'pharmacist');
    const denied = await request(app).get(`${BASE}/reports/finance.profit`).set(hdr(t, pharmacist.accessToken));
    expect(denied.status).toBe(403);
    const pharmacistCat = await request(app).get(`${BASE}/reports/catalogue`).set(auth(pharmacist.accessToken));
    expect(pharmacistCat.body.data.some((r: { sensitive?: boolean }) => r.sensitive)).toBe(false);
    const schedule = await request(app).get(`${BASE}/reports/pharmacy.scheduleRegister`).set(hdr(t, pharmacist.accessToken));
    expect(schedule.status).toBe(200);
  });
});

describe('notifications', () => {
  it('scans generate deduplicated alerts, visible by permission, readable per user', async () => {
    const t = await registerTenant();
    await seedSales(t);
    const scan = await request(app).post(`${BASE}/notifications/scan`).set(auth(t.accessToken));
    expect(scan.status).toBe(200);
    expect(scan.body.data.stock + scan.body.data.expiry + scan.body.data.credit).toBeGreaterThan(0);
    const again = await request(app).post(`${BASE}/notifications/scan`).set(auth(t.accessToken));
    expect(again.body.data.stock).toBe(0);
    expect(again.body.data.expiry).toBe(0);

    const list = await request(app).get(`${BASE}/notifications`).set(auth(t.accessToken));
    expect(list.status).toBe(200);
    expect(list.body.meta.unread).toBeGreaterThan(0);
    const types = list.body.data.map((n: { type: string }) => n.type);
    expect(types).toEqual(expect.arrayContaining(['stock.low', 'stock.expiringSoon', 'credit.overdue']));

    const first = list.body.data[0];
    await request(app).post(`${BASE}/notifications/${first.id}/read`).set(auth(t.accessToken));
    const after = await request(app).get(`${BASE}/notifications?unreadOnly=true`).set(auth(t.accessToken));
    expect(after.body.data.find((n: { id: string }) => n.id === first.id)).toBeUndefined();

    // Billing staff cannot see credit alerts (needs customers.viewLedger) but sees stock ones.
    const staff = await addMember(t, 'billing_staff');
    const staffList = await request(app).get(`${BASE}/notifications`).set(auth(staff.accessToken));
    expect(staffList.body.data.some((n: { type: string }) => n.type === 'credit.overdue')).toBe(false);
    expect(staffList.body.data.some((n: { type: string }) => n.type === 'stock.low')).toBe(true);

    const rules = await request(app).get(`${BASE}/notifications/rules`).set(auth(t.accessToken));
    expect(rules.body.data.find((r: { type: string }) => r.type === 'stock.expiringSoon').threshold).toBe(30);
    const upd = await request(app).put(`${BASE}/notifications/rules`).set(auth(t.accessToken)).send({ rules: [{ type: 'stock.low', enabled: false, channels: ['inApp'] }] });
    expect(upd.status).toBe(200);
    expect(upd.body.data.find((r: { type: string }) => r.type === 'stock.low').enabled).toBe(false);
    expect((await request(app).get(`${BASE}/notifications/rules`).set(auth(staff.accessToken))).status).toBe(403);
  });

  it('emits low-stock alerts immediately after a sale', async () => {
    const t = await registerTenant();
    const p = await createTabletProduct(t, { requiresPrescription: false, stockRules: { reorderLevelBase: 5, minStockBase: 0, maxStockBase: 0 } });
    const u = await unitIds(t);
    await postOpening(t, p.id, u.strip, 1, { batchNumber: 'B', expiryDate: inDays(200), mrpMinor: 100, purchasePriceMinor: 50 });
    await request(app).post(`${BASE}/sales`).set(hdr(t)).set('Idempotency-Key', key()).send({ lines: [{ productId: p.id, unitId: u.tablet, qty: 6 }], payments: [{ method: 'cash', amountMinor: 100 }] });
    await new Promise((r) => setTimeout(r, 300));
    const list = await request(app).get(`${BASE}/notifications?type=stock.low`).set(auth(t.accessToken));
    expect(list.body.data).toHaveLength(1);
  });
});

describe('subscription & entitlements', () => {
  it('exposes plans, usage and enforces plan changes against usage', async () => {
    const t = await registerTenant();
    const plans = await request(app).get(`${BASE}/subscription/plans`);
    expect(plans.status).toBe(200);
    expect(plans.body.data.map((p: { key: string }) => p.key)).toContain('standard');
    const sub = await request(app).get(`${BASE}/subscription`).set(auth(t.accessToken));
    expect(sub.body.data.plan.key).toBe('trial');
    expect(sub.body.data.status).toBe('trialing');
    expect(sub.body.data.usage.outlets).toBe(1);

    await request(app).post(`${BASE}/outlets`).set(auth(t.accessToken)).send({ name: 'B2', code: 'B2', stateCode: '27' });
    const tooSmall = await request(app).post(`${BASE}/subscription/change-plan`).set(auth(t.accessToken)).send({ planKey: 'starter' });
    expect(tooSmall.status).toBe(402);
    const ok = await request(app).post(`${BASE}/subscription/change-plan`).set(auth(t.accessToken)).send({ planKey: 'standard' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.plan.key).toBe('standard');
    expect(ok.body.data.status).toBe('active');
    expect(ok.body.data.history).toHaveLength(1);

    const admin = await addMember(t, 'org_admin');
    expect((await request(app).post(`${BASE}/subscription/change-plan`).set(auth(admin.accessToken)).send({ planKey: 'business' })).status).toBe(403);
  });

  it('gates features by plan', async () => {
    const t = await registerTenant();
    const branch = (await request(app).post(`${BASE}/outlets`).set(auth(t.accessToken)).send({ name: 'B2', code: 'B2', stateCode: '27' })).body.data;
    await request(app).post(`${BASE}/outlets/${branch.id}/archive`).set(auth(t.accessToken));
    const down = await request(app).post(`${BASE}/subscription/change-plan`).set(auth(t.accessToken)).send({ planKey: 'starter' });
    expect(down.status).toBe(200);
    const transfers = await request(app).get(`${BASE}/transfers`).set(hdr(t));
    expect(transfers.status).toBe(402);
    expect(transfers.body.error.code).toBe('PLAN_LIMIT');
    const templates = await request(app).get(`${BASE}/templates`).set(auth(t.accessToken));
    expect(templates.status).toBe(402);
    const prod = await request(app).get(`${BASE}/products`).set(auth(t.accessToken));
    expect(prod.status).toBe(200);
  });
});
