import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, BASE, registerTenant, auth, addMember, type TestTenant } from './helpers';
import { createTabletProduct, unitIds } from './catalog.test';
import { postOpening } from './inventory.test';

const key = () => `k-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
const hdr = (t: TestTenant, token = t.accessToken) => ({ ...auth(token), 'X-Outlet-Id': t.outletId });

/** Product with two batches: SOON (expires in 40 days, 3 strips) and LATE (1 year, 5 strips). MRP 185/strip, cost 132. */
async function seed(t: TestTenant, productOverrides: Record<string, unknown> = {}) {
  const p = await createTabletProduct(t, { requiresPrescription: false, schedule: 'none', ...productOverrides });
  const u = await unitIds(t);
  await postOpening(t, p.id, u.strip, 3, { batchNumber: 'SOON', expiryDate: inDays(40), mrpMinor: 18_500, sellingPriceMinor: 18_500, purchasePriceMinor: 13_200 });
  await postOpening(t, p.id, u.strip, 5, { batchNumber: 'LATE', expiryDate: inDays(365), mrpMinor: 18_500, sellingPriceMinor: 18_500, purchasePriceMinor: 13_000 });
  return { p, u };
}

async function createCustomer(t: TestTenant, extra: Record<string, unknown> = {}) {
  const res = await request(app).post(`${BASE}/customers`).set(auth(t.accessToken)).send({ name: 'Ravi Kumar', phone: '9000000001', creditLimitMinor: 50_000, ...extra });
  return res.body.data as { id: string; balanceMinor: number };
}

describe('POS sale: FEFO, loose units, GST, payments, credit', () => {
  it('quotes and sells with FEFO allocation across batches and loose tablets', async () => {
    const t = await registerTenant();
    const { p, u } = await seed(t);

    // 4 strips: 3 from SOON then 1 from LATE.
    const quote = await request(app).post(`${BASE}/sales/quote`).set(hdr(t)).send({ lines: [{ productId: p.id, unitId: u.strip, qty: 4 }] });
    expect(quote.status).toBe(200);
    expect(quote.body.data.lines.map((l: { batchNumber: string; qtyBase: number }) => [l.batchNumber, l.qtyBase])).toEqual([['SOON', 30], ['LATE', 10]]);
    expect(quote.body.data.warnings[0]).toMatch(/split/);
    // 4 × 185.00 = 740.00 inclusive of 12% GST → taxable 660.71, tax 79.29
    expect(quote.body.data.totals.grandTotalMinor).toBe(74_000);
    expect(quote.body.data.totals.taxableMinor + quote.body.data.totals.taxMinor).toBe(74_000);
    expect(quote.body.data.totals.cgstMinor + quote.body.data.totals.sgstMinor).toBe(quote.body.data.totals.taxMinor);

    const sale = await request(app).post(`${BASE}/sales`).set(hdr(t)).set('Idempotency-Key', key()).send({
      lines: [{ productId: p.id, unitId: u.strip, qty: 4 }, { productId: p.id, unitId: u.tablet, qty: 3 }],
      payments: [{ method: 'cash', amountMinor: 79_600 }],
      expectedGrandTotalMinor: 79_600,
    });
    expect(sale.status, JSON.stringify(sale.body)).toBe(201);
    expect(sale.body.data.number).toMatch(/^INV-/);
    expect(sale.body.data.lines).toHaveLength(3);
    expect(sale.body.data.lines[2].unitPriceMinor).toBe(1_850); // one tablet
    expect(sale.body.data.totals.roundOffMinor).toBe(50);
    expect(sale.body.data.paymentStatus).toBe('paid');
    expect(sale.body.data.profitMinor).toBeGreaterThan(0);

    const stock = await request(app).get(`${BASE}/inventory/stock`).set(hdr(t));
    expect(stock.body.data[0].onHandBase).toBe(80 - 43);
    const moves = await request(app).get(`${BASE}/inventory/movements?reason=sale`).set(hdr(t));
    expect(moves.body.data).toHaveLength(3);
    expect(moves.body.data.every((m: { refNumber: string }) => m.refNumber === sale.body.data.number)).toBe(true);
  });

  it('never sells expired stock and blocks near-expiry when configured', async () => {
    const t = await registerTenant();
    const p = await createTabletProduct(t, { requiresPrescription: false });
    const u = await unitIds(t);
    await postOpening(t, p.id, u.strip, 2, { batchNumber: 'OLD', expiryDate: inDays(-1), mrpMinor: 100, purchasePriceMinor: 50 });
    const none = await request(app).post(`${BASE}/sales/quote`).set(hdr(t)).send({ lines: [{ productId: p.id, unitId: u.strip, qty: 1 }] });
    expect(none.status).toBe(422);
    expect(none.body.error.message).toMatch(/Insufficient sellable stock/);

    await postOpening(t, p.id, u.strip, 2, { batchNumber: 'NEAR', expiryDate: inDays(10), mrpMinor: 100, purchasePriceMinor: 50 });
    await request(app).patch(`${BASE}/organization`).set(auth(t.accessToken)).send({ settings: { inventory: { blockNearExpirySaleDays: 30 } } });
    const blocked = await request(app).post(`${BASE}/sales/quote`).set(hdr(t)).send({ lines: [{ productId: p.id, unitId: u.strip, qty: 1 }] });
    expect(blocked.status).toBe(422);
  });

  it('enforces discount limits, price overrides and prescription rules by permission', async () => {
    const t = await registerTenant();
    const { p, u } = await seed(t, { requiresPrescription: true, schedule: 'H1' });
    const staff = await addMember(t, 'billing_staff');

    const bigDiscount = await request(app).post(`${BASE}/sales/quote`).set(hdr(t, staff.accessToken)).send({ lines: [{ productId: p.id, unitId: u.strip, qty: 1, discountBps: 2500 }] });
    expect(bigDiscount.status).toBe(403);
    expect(bigDiscount.body.error.message).toMatch(/exceeds/);

    const override = await request(app).post(`${BASE}/sales/quote`).set(hdr(t, staff.accessToken)).send({ lines: [{ productId: p.id, unitId: u.strip, qty: 1, unitPriceMinor: 10_000 }] });
    expect(override.status).toBe(403);

    const ownerOverride = await request(app).post(`${BASE}/sales/quote`).set(hdr(t)).send({ lines: [{ productId: p.id, unitId: u.strip, qty: 1, unitPriceMinor: 10_000, discountBps: 2500 }] });
    expect(ownerOverride.status).toBe(200);
    const aboveMrp = await request(app).post(`${BASE}/sales/quote`).set(hdr(t)).send({ lines: [{ productId: p.id, unitId: u.strip, qty: 1, unitPriceMinor: 99_000 }] });
    expect(aboveMrp.status).toBe(422);

    const noRx = await request(app).post(`${BASE}/sales`).set(hdr(t)).set('Idempotency-Key', key()).send({ lines: [{ productId: p.id, unitId: u.strip, qty: 1 }], payments: [{ method: 'cash', amountMinor: 18_500 }] });
    expect(noRx.status).toBe(422);
    expect(noRx.body.error.message).toMatch(/prescription/);
    const withDoctor = await request(app).post(`${BASE}/sales`).set(hdr(t)).set('Idempotency-Key', key()).send({ lines: [{ productId: p.id, unitId: u.strip, qty: 1 }], doctorName: 'Dr. Mehta', payments: [{ method: 'cash', amountMinor: 18_500 }] });
    expect(withDoctor.status).toBe(201);
  });

  it('split payments, credit (Baki), credit limit and later collection clear the balance', async () => {
    const t = await registerTenant();
    const { p, u } = await seed(t);
    const cust = await createCustomer(t);
    const pharmacist = await addMember(t, 'pharmacist');

    const exceeds = await request(app).post(`${BASE}/sales`).set(hdr(t, pharmacist.accessToken)).set('Idempotency-Key', key()).send({
      customerId: cust.id, lines: [{ productId: p.id, unitId: u.strip, qty: 4 }], payments: [], creditMinor: 74_000,
    });
    expect(exceeds.status).toBe(422);
    expect(exceeds.body.error.message).toMatch(/Credit limit/);

    const sale = await request(app).post(`${BASE}/sales`).set(hdr(t, pharmacist.accessToken)).set('Idempotency-Key', key()).send({
      customerId: cust.id,
      lines: [{ productId: p.id, unitId: u.strip, qty: 4 }],
      payments: [{ method: 'cash', amountMinor: 30_000 }, { method: 'upi', amountMinor: 20_000, reference: 'UPI-1' }],
      creditMinor: 24_000,
    });
    expect(sale.status, JSON.stringify(sale.body)).toBe(201);
    expect(sale.body.data.paymentStatus).toBe('partial');
    expect(sale.body.data.balanceMinor).toBe(24_000);
    expect(sale.body.data.dueDate).toBeTruthy();

    let customer = await request(app).get(`${BASE}/customers/${cust.id}`).set(auth(t.accessToken));
    expect(customer.body.data.balanceMinor).toBe(24_000);

    const mismatch = await request(app).post(`${BASE}/sales`).set(hdr(t)).set('Idempotency-Key', key()).send({ customerId: cust.id, lines: [{ productId: p.id, unitId: u.strip, qty: 1 }], payments: [{ method: 'cash', amountMinor: 100 }], creditMinor: 0 });
    expect(mismatch.status).toBe(400);

    const pay1 = await request(app).post(`${BASE}/customer-payments`).set(hdr(t)).set('Idempotency-Key', key()).send({ partyId: cust.id, method: 'cash', amountMinor: 10_000 });
    expect(pay1.status).toBe(201);
    expect(pay1.body.data.allocations[0].amountMinor).toBe(10_000);
    const outstanding = await request(app).get(`${BASE}/customer-payments/outstanding/${cust.id}`).set(auth(t.accessToken));
    expect(outstanding.body.data[0].balanceMinor).toBe(14_000);

    const pay2 = await request(app).post(`${BASE}/customer-payments`).set(hdr(t)).set('Idempotency-Key', key()).send({ partyId: cust.id, method: 'upi', amountMinor: 14_000, allocations: [{ documentId: sale.body.data.id, amountMinor: 14_000 }] });
    expect(pay2.status).toBe(201);
    customer = await request(app).get(`${BASE}/customers/${cust.id}`).set(auth(t.accessToken));
    expect(customer.body.data.balanceMinor).toBe(0);
    const settled = await request(app).get(`${BASE}/sales/${sale.body.data.id}`).set(auth(t.accessToken));
    expect(settled.body.data.paymentStatus).toBe('paid');
    expect(settled.body.data.payments).toHaveLength(4);

    const ledger = await request(app).get(`${BASE}/customers/${cust.id}/ledger`).set(auth(t.accessToken));
    expect(ledger.body.data.map((e: { type: string; balanceAfterMinor: number }) => [e.type, e.balanceAfterMinor])).toEqual([['payment', 0], ['payment', 14_000], ['sale', 24_000]]);

    // Cancelling a payment re-opens the balance.
    const cancel = await request(app).post(`${BASE}/customer-payments/${pay2.body.data.id}/cancel`).set(auth(t.accessToken)).send({ reason: 'UPI bounced' });
    expect(cancel.status).toBe(200);
    customer = await request(app).get(`${BASE}/customers/${cust.id}`).set(auth(t.accessToken));
    expect(customer.body.data.balanceMinor).toBe(14_000);
  });

  it('replays the same sale on an idempotent retry instead of double-selling', async () => {
    const t = await registerTenant();
    const { p, u } = await seed(t);
    const k = key();
    const body = { lines: [{ productId: p.id, unitId: u.strip, qty: 1 }], payments: [{ method: 'cash', amountMinor: 18_500 }] };
    const a = await request(app).post(`${BASE}/sales`).set(hdr(t)).set('Idempotency-Key', k).send(body);
    const b = await request(app).post(`${BASE}/sales`).set(hdr(t)).set('Idempotency-Key', k).send(body);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(b.body.data.id).toBe(a.body.data.id);
    const stock = await request(app).get(`${BASE}/inventory/stock`).set(hdr(t));
    expect(stock.body.data[0].onHandBase).toBe(70);
  });

  it('concurrent sales cannot oversell the last units', async () => {
    const t = await registerTenant();
    const p = await createTabletProduct(t, { requiresPrescription: false });
    const u = await unitIds(t);
    await postOpening(t, p.id, u.strip, 1, { batchNumber: 'ONLY', expiryDate: inDays(100), mrpMinor: 10_000, purchasePriceMinor: 5_000 });
    const attempts = await Promise.all(
      Array.from({ length: 4 }, () =>
        request(app).post(`${BASE}/sales`).set(hdr(t)).set('Idempotency-Key', key()).send({ lines: [{ productId: p.id, unitId: u.strip, qty: 1 }], payments: [{ method: 'cash', amountMinor: 10_000 }] }),
      ),
    );
    const ok = attempts.filter((r) => r.status === 201).length;
    expect(ok).toBe(1);
    expect(attempts.filter((r) => r.status === 422).length).toBe(3);
    const stock = await request(app).get(`${BASE}/inventory/stock`).set(hdr(t));
    expect(stock.body.data[0].onHandBase).toBe(0);
  });

  it('holds and resumes a bill, then cancels a completed invoice within the window', async () => {
    const t = await registerTenant();
    const { p, u } = await seed(t);
    const held = await request(app).post(`${BASE}/sales/held`).set(hdr(t)).send({ lines: [{ productId: p.id, unitId: u.strip, qty: 2 }], label: 'Counter 2' });
    expect(held.status).toBe(201);
    const list = await request(app).get(`${BASE}/sales/held`).set(hdr(t));
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].estimatedTotalMinor).toBe(37_000);
    const resumed = await request(app).get(`${BASE}/sales/held/${held.body.data.id}`).set(hdr(t));
    expect(resumed.body.data.input.lines[0].qty).toBe(2);

    const sale = await request(app).post(`${BASE}/sales`).set(hdr(t)).set('Idempotency-Key', key()).send({ ...resumed.body.data.input, payments: [{ method: 'card', amountMinor: 37_000 }], heldSaleId: held.body.data.id });
    expect(sale.status, JSON.stringify(sale.body)).toBe(201);
    expect((await request(app).get(`${BASE}/sales/held`).set(hdr(t))).body.data).toHaveLength(0);

    const cancel = await request(app).post(`${BASE}/sales/${sale.body.data.id}/cancel`).set(auth(t.accessToken)).send({ reason: 'Customer changed mind' });
    expect(cancel.status).toBe(200);
    expect(cancel.body.data.status).toBe('cancelled');
    const stock = await request(app).get(`${BASE}/inventory/stock`).set(hdr(t));
    expect(stock.body.data[0].onHandBase).toBe(80);
  });

  it('sales return restocks resaleable items, writes off damaged ones and refunds the effective price', async () => {
    const t = await registerTenant();
    const { p, u } = await seed(t);
    const cust = await createCustomer(t);
    const sale = await request(app).post(`${BASE}/sales`).set(hdr(t)).set('Idempotency-Key', key()).send({
      customerId: cust.id, lines: [{ productId: p.id, unitId: u.strip, qty: 2, discountBps: 1000 }], payments: [{ method: 'cash', amountMinor: 33_300 }],
    });
    expect(sale.status, JSON.stringify(sale.body)).toBe(201);
    const lineId = sale.body.data.lines[0].lineId;
    const ret = await request(app).post(`${BASE}/sales-returns`).set(hdr(t)).set('Idempotency-Key', key()).send({
      saleId: sale.body.data.id,
      lines: [{ saleLineId: lineId, qty: 1, condition: 'resaleable', reason: 'not_needed' }],
      settlement: 'refund',
      refund: { method: 'cash', amountMinor: 1 },
    });
    expect(ret.status, JSON.stringify(ret.body)).toBe(201);
    expect(ret.body.data.totals.grandTotalMinor).toBe(16_700); // half of 333.00 rounded to the rupee
    let stock = await request(app).get(`${BASE}/inventory/stock`).set(hdr(t));
    expect(stock.body.data[0].onHandBase).toBe(70);

    const tooMany = await request(app).post(`${BASE}/sales-returns`).set(hdr(t)).set('Idempotency-Key', key()).send({ saleId: sale.body.data.id, lines: [{ saleLineId: lineId, qty: 2, reason: 'other' }], settlement: 'refund', refund: { method: 'cash', amountMinor: 1 } });
    expect(tooMany.status).toBe(422);

    const damaged = await request(app).post(`${BASE}/sales-returns`).set(hdr(t)).set('Idempotency-Key', key()).send({ saleId: sale.body.data.id, lines: [{ saleLineId: lineId, qty: 1, condition: 'damaged', reason: 'damaged' }], settlement: 'credit_note' });
    expect(damaged.status, JSON.stringify(damaged.body)).toBe(201);
    stock = await request(app).get(`${BASE}/inventory/stock`).set(hdr(t));
    expect(stock.body.data[0].onHandBase).toBe(70); // came in, then written off
    const customer = await request(app).get(`${BASE}/customers/${cust.id}`).set(auth(t.accessToken));
    expect(customer.body.data.balanceMinor).toBe(-16_600); // advance credit, capped so refunds never exceed the invoice

    const invoice = await request(app).get(`${BASE}/sales/${sale.body.data.id}`).set(auth(t.accessToken));
    expect(invoice.body.data.lines[0].returnedBase).toBe(20);
    expect(invoice.body.data.refundedMinor).toBe(33_300);
    expect((await request(app).post(`${BASE}/sales/${sale.body.data.id}/cancel`).set(auth(t.accessToken)).send({ reason: 'Trying to cancel' })).status).toBe(422);
  });

  it('uses IGST for inter-state B2B customers', async () => {
    const t = await registerTenant({ stateCode: '27' });
    const { p, u } = await seed(t);
    const cust = await createCustomer(t, { gstin: '29ABCDE1234F1Z5', stateCode: '29' });
    const quote = await request(app).post(`${BASE}/sales/quote`).set(hdr(t)).send({ customerId: cust.id, lines: [{ productId: p.id, unitId: u.strip, qty: 1 }] });
    expect(quote.body.data.isInterState).toBe(true);
    expect(quote.body.data.totals.igstMinor).toBeGreaterThan(0);
    expect(quote.body.data.totals.cgstMinor).toBe(0);
  });
});
