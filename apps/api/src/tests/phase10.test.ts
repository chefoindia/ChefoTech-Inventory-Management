import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, BASE, registerTenant, auth, type TestTenant } from './helpers';
import { createTabletProduct, unitIds } from './catalog.test';
import { postOpening } from './inventory.test';
import { pushSent } from '@/services/push/push.service';
import { smsProvider, whatsappProvider, type ConsoleTextProvider } from '@/services/messaging/messaging.service';

const key = () => `k-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
const hdr = (t: TestTenant) => ({ ...auth(t.accessToken), 'X-Outlet-Id': t.outletId });

async function makeSale(t: TestTenant) {
  const u = await unitIds(t);
  const p = await createTabletProduct(t, { requiresPrescription: false, schedule: 'none' });
  await postOpening(t, p.id, u.strip, 5, { batchNumber: 'B1', expiryDate: inDays(365), mrpMinor: 18_500, sellingPriceMinor: 18_500, purchasePriceMinor: 13_200 });
  const sale = await request(app).post(`${BASE}/sales`).set(hdr(t)).set('Idempotency-Key', key()).send({ walkIn: { name: 'Ravi', phone: '9876543210' }, lines: [{ productId: p.id, unitId: u.strip, qty: 1 }], payments: [{ method: 'cash', amountMinor: 18_500 }] });
  expect(sale.status).toBe(201);
  return sale.body.data as { id: string; number: string };
}

describe('share links: WhatsApp-ready public document access', () => {
  it('creates a signed link, serves the PDF without auth, and rejects tampering', async () => {
    const t = await registerTenant();
    const sale = await makeSale(t);
    const link = await request(app).post(`${BASE}/documents/saleInvoice/${sale.id}/share-link`).set(hdr(t)).send({ phone: '9876543210', label: `Invoice ${sale.number}` });
    expect(link.status).toBe(200);
    expect(link.body.data.url).toMatch(/\/share\//);
    expect(link.body.data.whatsappUrl).toMatch(/^https:\/\/wa\.me\/919876543210\?text=/);
    const token = String(link.body.data.url).split('/share/')[1]!;

    const pdf = await request(app).get(`/share/${token}`);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');

    const bad = await request(app).get(`/share/${token.slice(0, -4)}xxxx`);
    expect(bad.status).toBe(400);

    // Another tenant cannot mint a link for this sale.
    const other = await registerTenant();
    const forbidden = await request(app).post(`${BASE}/documents/saleInvoice/${sale.id}/share-link`).set(hdr(other)).send({});
    expect([403, 404]).toContain(forbidden.status);
  });
});

describe('billing: plan checkout without a gateway configured', () => {
  it('reports the billing status, lists no invoices, and refuses checkout with a clear business error', async () => {
    const t = await registerTenant();
    const sub = await request(app).get(`${BASE}/subscription`).set(hdr(t));
    expect(sub.status).toBe(200);
    expect(sub.body.data.billing.provider).toBe('none');
    expect(sub.body.data.billing.channels.email).toBeDefined();

    const invoices = await request(app).get(`${BASE}/subscription/invoices`).set(hdr(t));
    expect(invoices.status).toBe(200);
    expect(invoices.body.data).toEqual([]);

    const checkout = await request(app).post(`${BASE}/subscription/checkout`).set(hdr(t)).send({ planKey: 'standard', months: 12 });
    expect(checkout.status).toBe(422);
    expect(checkout.body.error.code).toBe('BUSINESS_RULE');

    // Webhooks with a bad signature are rejected and change nothing.
    const hook = await request(app).post(`${BASE}/subscription/webhook`).set('x-razorpay-signature', 'nope').send({ event: 'payment.captured', payload: {} });
    expect(hook.status).toBe(400);
  });
});

describe('push subscriptions and messaging channels', () => {
  it('stores and removes a device subscription; notification channels fan out to sms/whatsapp/push adapters', async () => {
    const t = await registerTenant();
    const endpoint = `https://push.example.com/${Date.now()}`;
    const keyRes = await request(app).get(`${BASE}/notifications/push/public-key`).set(hdr(t));
    expect(keyRes.status).toBe(200);
    expect(keyRes.body.data.publicKey).toBe('');

    const sub = await request(app).post(`${BASE}/notifications/push/subscriptions`).set(hdr(t)).send({ endpoint, keys: { p256dh: 'p256dh-key', auth: 'auth-key' }, userAgent: 'test' });
    expect(sub.status).toBe(204);

    // Turn on every channel for low-stock alerts, then trigger a scan with a product below reorder level.
    const rules = await request(app).put(`${BASE}/notifications/rules`).set(hdr(t)).send({ rules: [{ type: 'stock.low', enabled: true, channels: ['inApp', 'email', 'sms', 'whatsapp', 'push'], roleKeys: [] }] });
    expect(rules.status).toBe(200);
    await request(app).patch(`${BASE}/users/me/profile`).set(auth(t.accessToken)).send({ phone: '9876543210' });
    const u = await unitIds(t);
    const p = await createTabletProduct(t, { stockRules: { reorderLevelBase: 100, minStockBase: 0, maxStockBase: 0 } });
    await postOpening(t, p.id, u.strip, 1, { batchNumber: 'LOW', expiryDate: inDays(365), mrpMinor: 18_500, purchasePriceMinor: 13_200 });
    const scan = await request(app).post(`${BASE}/notifications/scan`).set(hdr(t));
    expect(scan.status).toBe(200);

    const sms = (smsProvider as ConsoleTextProvider).sent;
    const wa = (whatsappProvider as ConsoleTextProvider).sent;
    expect(sms.some((m) => m.to === '9876543210' && m.text.includes('PharmaOS'))).toBe(true);
    expect(wa.some((m) => m.to === '9876543210')).toBe(true);
    // Push is not configured in tests; the adapter reports skipped rather than throwing, and nothing is recorded.
    expect(pushSent.length).toBe(0);

    const list = await request(app).get(`${BASE}/notifications`).set(hdr(t));
    expect(list.body.data.some((n: { type: string }) => n.type === 'stock.low')).toBe(true);

    const del = await request(app).delete(`${BASE}/notifications/push/subscriptions`).set(hdr(t)).send({ endpoint });
    expect(del.status).toBe(204);
  });
});
