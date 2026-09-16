import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, BASE, registerTenant, auth, type TestTenant } from './helpers';
import { createTabletProduct, unitIds } from './catalog.test';
import { postOpening } from './inventory.test';
import { UnitModel } from '@/models/unit.model';

const key = () => `k-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
const hdr = (t: TestTenant) => ({ ...auth(t.accessToken), 'X-Outlet-Id': t.outletId });

/**
 * Mirrors the browser walkthrough of the operational critical path so a regression anywhere in
 * product → stock → POS → purchase → ledger → dashboard fails a single, readable test.
 */
describe('critical path: product → opening stock → POS sale → purchase (receive now) → stock, ledger, dashboard', () => {
  it('runs end to end with the same numbers the UI shows', async () => {
    const t = await registerTenant();
    const u = await unitIds(t);
    const p = await createTabletProduct(t, { pricing: { mrpMinor: 18_500, sellingPriceMinor: 18_000, purchasePriceMinor: 13_200 }, stockRules: { reorderLevelBase: 50, minStockBase: 0, maxStockBase: 0 } });

    // 25 strips of 10 = 250 tablets at ₹132/strip cost.
    await postOpening(t, p.id, u.strip, 25, { batchNumber: 'B2301', expiryDate: inDays(560), mrpMinor: 18_500, sellingPriceMinor: 18_000, purchasePriceMinor: 13_200 });

    // Schedule-H product: the first attempt without a doctor or prescription is refused (business rule)…
    const saleKey = key();
    const body = { lines: [{ productId: p.id, unitId: u.strip, qty: 2 }], payments: [{ method: 'cash', amountMinor: 36_000 }] };
    const refused = await request(app).post(`${BASE}/sales`).set(hdr(t)).set('Idempotency-Key', saleKey).send(body);
    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe('BUSINESS_RULE');

    // …and the corrected retry may reuse the same key because a failed request releases it.
    const sale = await request(app).post(`${BASE}/sales`).set(hdr(t)).set('Idempotency-Key', saleKey).send({ ...body, doctorName: 'Dr Mehta' });
    expect(sale.status).toBe(201);
    expect(sale.body.data.number).toMatch(/^INV-/);
    expect(sale.body.data.totals.grandTotalMinor).toBe(36_000);
    expect(sale.body.data.totals.taxableMinor).toBe(32_143);
    expect(sale.body.data.paymentStatus).toBe('paid');
    expect(sale.body.data.lines[0].batchNumber).toBe('B2301');

    // The invoice PDF renders.
    const pdf = await request(app).get(`${BASE}/documents/saleInvoice/${sale.body.data.id}`).set(hdr(t));
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');

    // Supplier + purchase with 10 strips paid and 1 free, received immediately.
    const sup = await request(app).post(`${BASE}/suppliers`).set(auth(t.accessToken)).send({ name: 'Medico Distributors', gstin: '27ABCDE1234F1Z5', stateCode: '27', paymentTermsDays: 30 });
    expect(sup.status).toBe(201);
    const purchase = await request(app)
      .post(`${BASE}/purchases`)
      .set(hdr(t))
      .set('Idempotency-Key', key())
      .send({
        supplierId: sup.body.data.id,
        supplierInvoiceNumber: 'MD/2026/0912',
        invoiceDate: inDays(0),
        lines: [{ productId: p.id, unitId: u.strip, qty: 10, freeQty: 1, batchNumber: 'B2405', expiryDate: inDays(470), purchasePriceMinor: 13_200, mrpMinor: 18_500, sellingPriceMinor: 18_000 }],
        receiveNow: true,
        expectedGrandTotalMinor: 147_800,
      });
    expect(purchase.status).toBe(201);
    expect(purchase.body.data.status).toBe('received');
    expect(purchase.body.data.totals.grandTotalMinor).toBe(147_800);
    expect(purchase.body.data.lines[0].receivedBase).toBe(100);
    expect(purchase.body.data.lines[0].freeQtyBase).toBe(10);
    expect(purchase.body.data.grnIds).toHaveLength(1);

    // Stock: 250 − 20 sold + 100 + 10 free = 340 tablets, valued at cost.
    const stock = await request(app).get(`${BASE}/inventory/stock`).set(hdr(t)).query({ page: 1, pageSize: 10 });
    expect(stock.status).toBe(200);
    const row = stock.body.data.find((r: { productId: string }) => r.productId === p.id);
    expect(row.onHandBase).toBe(340);
    expect(row.batchCount).toBe(2);
    expect(row.valuationCostMinor).toBe(340 * 1_320);

    // Supplier owes: payable equals the invoice.
    const supplier = await request(app).get(`${BASE}/suppliers/${sup.body.data.id}`).set(auth(t.accessToken));
    expect(supplier.body.data.balanceMinor).toBe(147_800);
    const ledger = await request(app).get(`${BASE}/suppliers/${sup.body.data.id}/ledger`).set(auth(t.accessToken));
    expect(ledger.body.data.some((e: { refNumber: string }) => e.refNumber === purchase.body.data.number)).toBe(true);

    // Dashboard reflects the day.
    const dash = await request(app).get(`${BASE}/dashboard/summary`).set(hdr(t));
    expect(dash.status).toBe(200);
    expect(dash.body.data.sales.invoices).toBe(1);
    expect(dash.body.data.sales.revenueMinor).toBe(36_000);
    expect(dash.body.data.purchases.valueMinor).toBe(147_800);
    expect(dash.body.data.payables.outstandingMinor).toBe(147_800);
    expect(dash.body.data.inventory.products).toBeGreaterThanOrEqual(1);

    // Whole-organization export bundle for business continuity.
    const bundle = await request(app).get(`${BASE}/exports/organization`).set(hdr(t));
    expect(bundle.status).toBe(200);
    expect(bundle.headers['content-type']).toContain('application/json');
    const parsed = bundle.body as { format: string; products: unknown[]; sales: unknown[]; purchases: unknown[]; ledger: unknown[] };
    expect(parsed.format).toBe('pharmaos.organization-export');
    expect(parsed.products.length).toBeGreaterThanOrEqual(1);
    expect(parsed.sales.length).toBe(1);
    expect(parsed.purchases.length).toBe(1);
    expect(parsed.ledger.length).toBeGreaterThanOrEqual(1);
  });

  it('seeds default units on first use for organizations that have none', async () => {
    const t = await registerTenant();
    await UnitModel.deleteMany({ organizationId: t.organizationId });
    const res = await request(app).get(`${BASE}/units`).set(auth(t.accessToken));
    expect(res.status).toBe(200);
    const names = (res.body.data as { name: string; isSystem: boolean }[]).map((x) => x.name);
    expect(names).toEqual(expect.arrayContaining(['Tablet', 'Strip', 'Bottle', 'Millilitre']));
    expect((res.body.data as { isSystem: boolean }[]).every((x) => x.isSystem)).toBe(true);
  });
});
