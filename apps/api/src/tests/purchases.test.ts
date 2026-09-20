import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, BASE, registerTenant, auth, addMember, type TestTenant } from './helpers';
import { createTabletProduct, unitIds } from './catalog.test';

const key = () => `k-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
const hdr = (t: TestTenant, token = t.accessToken) => ({ ...auth(token), 'X-Outlet-Id': t.outletId });

export async function createSupplier(t: TestTenant, overrides: Record<string, unknown> = {}) {
  const res = await request(app).post(`${BASE}/suppliers`).set(auth(t.accessToken)).send({ name: 'Medico Distributors', phone: '9876543210', stateCode: '27', gstin: '27ABCDE1234F1Z5', paymentTermsDays: 15, ...overrides });
  if (res.status !== 201) throw new Error(`supplier failed: ${JSON.stringify(res.body)}`);
  return res.body.data as { id: string; balanceMinor: number };
}

export async function createPurchase(t: TestTenant, supplierId: string, productId: string, unitId: string, extra: Record<string, unknown> = {}, lineExtra: Record<string, unknown> = {}) {
  const res = await request(app)
    .post(`${BASE}/purchases`)
    .set(hdr(t))
    .set('Idempotency-Key', key())
    .send({
      supplierId,
      supplierInvoiceNumber: `SI-${Math.random().toString(36).slice(2, 8)}`,
      invoiceDate: new Date().toISOString(),
      lines: [{ productId, unitId, qty: 10, freeQty: 1, batchNumber: 'PB1', expiryDate: inDays(400), purchasePriceMinor: 13_200, mrpMinor: 18_500, sellingPriceMinor: 18_000, taxRateBps: 1200, ...lineExtra }],
      ...extra,
    });
  if (res.status !== 201) throw new Error(`purchase failed: ${JSON.stringify(res.body)}`);
  return res.body.data;
}

describe('purchases → GRN → stock → payable', () => {
  it('records a purchase with GST, posts the payable and receives stock via GRN with a free quantity', async () => {
    const t = await registerTenant();
    const sup = await createSupplier(t);
    const p = await createTabletProduct(t);
    const u = await unitIds(t);

    const purchase = await createPurchase(t, sup.id, p.id, u.strip);
    // 10 strips × 132.00 = 1320.00 taxable, GST 12% intra-state → 158.40 → total 1478.40
    expect(purchase.totals.taxableMinor).toBe(132_000);
    expect(purchase.totals.cgstMinor).toBe(7_920);
    expect(purchase.totals.sgstMinor).toBe(7_920);
    expect(purchase.totals.roundOffMinor).toBe(-40);
    expect(purchase.totals.grandTotalMinor).toBe(147_800);
    expect(purchase.status).toBe('confirmed');
    expect(purchase.balanceMinor).toBe(147_800);

    const supplier = await request(app).get(`${BASE}/suppliers/${sup.id}`).set(auth(t.accessToken));
    expect(supplier.body.data.balanceMinor).toBe(147_800);

    // Nothing in stock until GRN.
    let stock = await request(app).get(`${BASE}/inventory/stock`).set(hdr(t));
    expect(stock.body.data[0].onHandBase).toBe(0);

    const grn = await request(app).post(`${BASE}/grns`).set(hdr(t)).set('Idempotency-Key', key()).send({
      purchaseId: purchase.id,
      lines: [{ purchaseLineId: purchase.lines[0].lineId, receivedQty: 10, freeQty: 1 }],
    });
    expect(grn.status).toBe(201);
    expect(grn.body.data.status).toBe('confirmed');

    stock = await request(app).get(`${BASE}/inventory/stock`).set(hdr(t));
    expect(stock.body.data[0].onHandBase).toBe(110); // 11 strips incl. free
    const after = await request(app).get(`${BASE}/purchases/${purchase.id}`).set(auth(t.accessToken));
    expect(after.body.data.status).toBe('received');

    const batches = await request(app).get(`${BASE}/inventory/batches`).set(hdr(t));
    expect(batches.body.data[0].batchNumber).toBe('PB1');
    expect(batches.body.data[0].supplierName).toBe('Medico Distributors');
    expect(batches.body.data[0].purchasePriceMinor).toBe(13_200);
  });


  it('saves a purchase without receiving, then receives it with pack barcodes that scan back to the batch', async () => {
    const t = await registerTenant();
    const sup = await createSupplier(t);
    const p = await createTabletProduct(t);
    const u = await unitIds(t);

    // 1. Save only — the supplier bill is recorded but no stock exists yet.
    const purchase = await createPurchase(t, sup.id, p.id, u.strip, { receiveNow: false });
    expect(purchase.status).toBe('confirmed');
    expect(purchase.grnIds ?? []).toHaveLength(0);
    let stock = await request(app).get(`${BASE}/inventory/stock`).set(hdr(t));
    expect(stock.body.data[0]?.onHandBase ?? 0).toBe(0);

    // 2. Receive later, labelling each of the 7 strips that physically arrived.
    const lineId = purchase.lines[0].lineId;
    const labels = ['MTK-0001', 'MTK-0002', 'MTK-0003', 'MTK-0004', 'MTK-0005', 'MTK-0006', 'MTK-0007'];
    const grn = await request(app).post(`${BASE}/grns`).set(hdr(t)).set('Idempotency-Key', key()).send({
      purchaseId: purchase.id,
      lines: [{ purchaseLineId: lineId, receivedQty: 7, barcodes: labels }],
    });
    expect(grn.status).toBe(201);
    expect(grn.body.data.lines[0].barcodes).toEqual(labels);

    // Part of the order is still outstanding, so the purchase is only partially received.
    const after = await request(app).get(`${BASE}/purchases/${purchase.id}`).set(hdr(t));
    expect(after.body.data.status).toBe('partially_received');

    // 3. Scanning a label resolves to the product AND the exact batch it was stuck on.
    const scan = await request(app).get(`${BASE}/products/by-barcode/MTK-0004`).set(hdr(t));
    expect(scan.status).toBe(200);
    expect(scan.body.data.id).toBe(p.id);
    expect(scan.body.data.matchedBatchId).toBeTruthy();
    const batch = scan.body.data.batches?.find((b: { batchId: string }) => b.batchId === scan.body.data.matchedBatchId);
    expect(batch?.batchNumber).toBe('PB1');
    // The scanned pack carries its own batch prices, which is the whole point of labelling.
    expect(batch?.mrpMinor).toBe(18_500);
    expect(batch?.purchasePriceMinor).toBe(13_200);
  });

  it('refuses a barcode label that is already on another batch, and a label repeated within one receipt', async () => {
    const t = await registerTenant();
    const sup = await createSupplier(t);
    const p = await createTabletProduct(t);
    const u = await unitIds(t);

    const first = await createPurchase(t, sup.id, p.id, u.strip);
    await request(app).post(`${BASE}/grns`).set(hdr(t)).set('Idempotency-Key', key()).send({
      purchaseId: first.id,
      lines: [{ purchaseLineId: first.lines[0].lineId, receivedQty: 5, barcodes: ['DUP-001'] }],
    }).expect(201);

    // Same label on a different batch of the same product must be rejected.
    const second = await createPurchase(t, sup.id, p.id, u.strip, {}, { batchNumber: 'PB2' });
    const clash = await request(app).post(`${BASE}/grns`).set(hdr(t)).set('Idempotency-Key', key()).send({
      purchaseId: second.id,
      lines: [{ purchaseLineId: second.lines[0].lineId, receivedQty: 5, barcodes: ['DUP-001'] }],
    });
    expect(clash.status).toBe(422);
    expect(String(clash.body.error?.message ?? '')).toContain('already on batch');

    // Scanning the same pack twice on one line is a slip, not an error: it is deduped so the
    // counter in the UI simply shows one fewer label than packs.
    const third = await createPurchase(t, sup.id, p.id, u.strip, {}, { batchNumber: 'PB3' });
    const repeated = await request(app).post(`${BASE}/grns`).set(hdr(t)).set('Idempotency-Key', key()).send({
      purchaseId: third.id,
      lines: [{ purchaseLineId: third.lines[0].lineId, receivedQty: 5, barcodes: ['SAME-1', 'SAME-1'] }],
    });
    expect(repeated.status).toBe(201);
    expect(repeated.body.data.lines[0].barcodes).toEqual(['SAME-1']);
  });

  it('adds and removes product barcodes by hand, rejecting codes already in use', async () => {
    const t = await registerTenant();
    const p = await createTabletProduct(t);

    const added = await request(app).post(`${BASE}/products/${p.id}/barcodes`).set(hdr(t)).send({ code: 'MANUAL-123' });
    expect(added.status).toBe(200);
    expect(added.body.data.barcodes.some((b: { code: string }) => b.code === 'MANUAL-123')).toBe(true);

    // Same code twice on the same product is pointless.
    const again = await request(app).post(`${BASE}/products/${p.id}/barcodes`).set(hdr(t)).send({ code: 'MANUAL-123' });
    expect(again.status).toBe(422);

    const removed = await request(app).delete(`${BASE}/products/${p.id}/barcodes/MANUAL-123`).set(hdr(t));
    expect(removed.status).toBe(200);
    expect(removed.body.data.barcodes.some((b: { code: string }) => b.code === 'MANUAL-123')).toBe(false);
  });


  it('receiveNow carries the pack barcodes typed on the purchase lines onto the batch', async () => {
    const t = await registerTenant();
    const sup = await createSupplier(t);
    const p = await createTabletProduct(t);
    const u = await unitIds(t);

    // Ticking "receive all stock now" collects the labels on the form itself.
    const purchase = await createPurchase(t, sup.id, p.id, u.strip, { receiveNow: true }, { barcodes: ['INLINE-1', 'INLINE-2'] });
    expect(purchase.status).toBe('received');

    const scan = await request(app).get(`${BASE}/products/by-barcode/INLINE-2`).set(hdr(t));
    expect(scan.status).toBe(200);
    expect(scan.body.data.matchedBatchId).toBeTruthy();
    const batch = scan.body.data.batches?.find((b: { batchId: string }) => b.batchId === scan.body.data.matchedBatchId);
    expect(batch?.batchNumber).toBe('PB1');
    expect(batch?.purchasePriceMinor).toBe(13_200);
  });

  it('leaves barcodes empty when the purchase is saved without receiving', async () => {
    const t = await registerTenant();
    const sup = await createSupplier(t);
    const p = await createTabletProduct(t);
    const u = await unitIds(t);
    // Labels sent without receiveNow are ignored: there is no batch yet to stick them on.
    const purchase = await createPurchase(t, sup.id, p.id, u.strip, { receiveNow: false }, { barcodes: ['IGNORED-1'] });
    expect(purchase.status).toBe('confirmed');
    const scan = await request(app).get(`${BASE}/products/by-barcode/IGNORED-1`).set(hdr(t));
    expect(scan.status).toBe(404);
  });


  it('sells a scanned pack at ITS batch price, not the product default', async () => {
    const t = await registerTenant();
    const sup = await createSupplier(t);
    const p = await createTabletProduct(t);
    const u = await unitIds(t);

    // Two receipts of the same product at different selling prices, each labelled.
    await createPurchase(t, sup.id, p.id, u.strip, { receiveNow: true }, { batchNumber: 'OLD', expiryDate: inDays(200), sellingPriceMinor: 10_000, mrpMinor: 12_000, barcodes: ['PACK-OLD'] });
    await createPurchase(t, sup.id, p.id, u.strip, { receiveNow: true }, { batchNumber: 'NEW', expiryDate: inDays(600), sellingPriceMinor: 25_000, mrpMinor: 30_000, barcodes: ['PACK-NEW'] });

    // Scanning the NEW pack must resolve to the NEW batch...
    const scan = await request(app).get(`${BASE}/products/by-barcode/PACK-NEW`).set(hdr(t));
    expect(scan.status).toBe(200);
    const batchId = scan.body.data.matchedBatchId as string;
    expect(batchId).toBeTruthy();

    // ...and selling that batch must use ITS price (250.00), not FEFO's older 100.00 batch.
    const quoted = await request(app).post(`${BASE}/sales/quote`).set(hdr(t)).send({ lines: [{ productId: p.id, unitId: u.strip, batchId, qty: 1 }] });
    expect(quoted.status).toBe(200);
    expect(quoted.body.data.lines[0].batchNumber).toBe('NEW');
    expect(quoted.body.data.lines[0].unitPriceMinor).toBe(25_000);

    // Without the label, FEFO picks the older, cheaper batch — which is the behaviour a scan overrides.
    const fefo = await request(app).post(`${BASE}/sales/quote`).set(hdr(t)).send({ lines: [{ productId: p.id, unitId: u.strip, qty: 1 }] });
    expect(fefo.body.data.lines[0].batchNumber).toBe('OLD');
    expect(fefo.body.data.lines[0].unitPriceMinor).toBe(10_000);
  });

  it('handles partial receipt, short and damaged quantities', async () => {
    const t = await registerTenant();
    const sup = await createSupplier(t);
    const p = await createTabletProduct(t);
    const u = await unitIds(t);
    const purchase = await createPurchase(t, sup.id, p.id, u.strip, {}, { freeQty: 0 });
    const lineId = purchase.lines[0].lineId;

    const first = await request(app).post(`${BASE}/grns`).set(hdr(t)).set('Idempotency-Key', key()).send({ purchaseId: purchase.id, lines: [{ purchaseLineId: lineId, receivedQty: 6, damagedQty: 1 }] });
    expect(first.status).toBe(201);
    let pur = await request(app).get(`${BASE}/purchases/${purchase.id}`).set(auth(t.accessToken));
    expect(pur.body.data.status).toBe('partially_received');
    let stock = await request(app).get(`${BASE}/inventory/stock`).set(hdr(t));
    expect(stock.body.data[0].onHandBase).toBe(60);
    const damage = await request(app).get(`${BASE}/inventory/movements?reason=damage`).set(hdr(t));
    expect(damage.body.data[0].qtyBaseDelta).toBe(-10);

    const rest = await request(app).post(`${BASE}/grns`).set(hdr(t)).set('Idempotency-Key', key()).send({ purchaseId: purchase.id, lines: [{ purchaseLineId: lineId, receivedQty: 3 }] });
    expect(rest.status).toBe(201);
    pur = await request(app).get(`${BASE}/purchases/${purchase.id}`).set(auth(t.accessToken));
    expect(pur.body.data.status).toBe('received');
    stock = await request(app).get(`${BASE}/inventory/stock`).set(hdr(t));
    expect(stock.body.data[0].onHandBase).toBe(90);
    const grns = await request(app).get(`${BASE}/grns?purchaseId=${purchase.id}`).set(hdr(t));
    expect(grns.body.data).toHaveLength(2);
  });

  it('owner can receive excess; staff without permission cannot', async () => {
    const t = await registerTenant();
    const sup = await createSupplier(t);
    const p = await createTabletProduct(t);
    const u = await unitIds(t);
    const purchase = await createPurchase(t, sup.id, p.id, u.strip, {}, { freeQty: 0 });
    const lineId = purchase.lines[0].lineId;
    const inventoryMgr = await addMember(t, 'inventory_manager');
    const denied = await request(app).post(`${BASE}/grns`).set(hdr(t, inventoryMgr.accessToken)).set('Idempotency-Key', key()).send({ purchaseId: purchase.id, lines: [{ purchaseLineId: lineId, receivedQty: 12 }] });
    expect(denied.status).toBe(422);
    const okRes = await request(app).post(`${BASE}/grns`).set(hdr(t)).set('Idempotency-Key', key()).send({ purchaseId: purchase.id, lines: [{ purchaseLineId: lineId, receivedQty: 12 }] });
    expect(okRes.status).toBe(201);
  });

  it('receiveNow creates the GRN inline and inline payments reduce the payable', async () => {
    const t = await registerTenant();
    const sup = await createSupplier(t);
    const p = await createTabletProduct(t);
    const u = await unitIds(t);
    const purchase = await createPurchase(t, sup.id, p.id, u.strip, { receiveNow: true, payments: [{ method: 'bank_transfer', amountMinor: 100_000, reference: 'NEFT123' }] });
    expect(purchase.status).toBe('received');
    expect(purchase.paidMinor).toBe(100_000);
    expect(purchase.balanceMinor).toBe(47_800);
    expect(purchase.paymentStatus).toBe('partial');
    const supplier = await request(app).get(`${BASE}/suppliers/${sup.id}`).set(auth(t.accessToken));
    expect(supplier.body.data.balanceMinor).toBe(47_800);

    const pay = await request(app).post(`${BASE}/supplier-payments`).set(hdr(t)).set('Idempotency-Key', key()).send({ partyId: sup.id, method: 'upi', amountMinor: 47_800 });
    expect(pay.status).toBe(201);
    expect(pay.body.data.allocations[0].documentNumber).toBe(purchase.number);
    const settled = await request(app).get(`${BASE}/purchases/${purchase.id}`).set(auth(t.accessToken));
    expect(settled.body.data.paymentStatus).toBe('paid');
    const ledger = await request(app).get(`${BASE}/suppliers/${sup.id}/ledger`).set(auth(t.accessToken));
    expect(ledger.body.data[0].balanceAfterMinor).toBe(0);
    expect(ledger.body.data.map((e: { type: string }) => e.type)).toEqual(['payment', 'payment', 'purchase']);
  });

  it('rejects duplicate supplier invoice numbers, expired batches and stale totals', async () => {
    const t = await registerTenant();
    const sup = await createSupplier(t);
    const p = await createTabletProduct(t);
    const u = await unitIds(t);
    const base = { supplierId: sup.id, supplierInvoiceNumber: 'DUP-1', invoiceDate: new Date().toISOString(), lines: [{ productId: p.id, unitId: u.strip, qty: 1, batchNumber: 'B', expiryDate: inDays(100), purchasePriceMinor: 100, mrpMinor: 150 }] };
    expect((await request(app).post(`${BASE}/purchases`).set(hdr(t)).set('Idempotency-Key', key()).send(base)).status).toBe(201);
    expect((await request(app).post(`${BASE}/purchases`).set(hdr(t)).set('Idempotency-Key', key()).send(base)).status).toBe(409);
    const expired = await request(app).post(`${BASE}/purchases`).set(hdr(t)).set('Idempotency-Key', key()).send({ ...base, supplierInvoiceNumber: 'X2', lines: [{ ...base.lines[0], expiryDate: inDays(-2) }] });
    expect(expired.status).toBe(400);
    const stale = await request(app).post(`${BASE}/purchases`).set(hdr(t)).set('Idempotency-Key', key()).send({ ...base, supplierInvoiceNumber: 'X3', expectedGrandTotalMinor: 1 });
    expect(stale.status).toBe(422);
  });

  it('returns goods to the supplier: stock out, payable reduced', async () => {
    const t = await registerTenant();
    const sup = await createSupplier(t);
    const p = await createTabletProduct(t);
    const u = await unitIds(t);
    const purchase = await createPurchase(t, sup.id, p.id, u.strip, { receiveNow: true }, { freeQty: 0 });
    const batchId = (await request(app).get(`${BASE}/inventory/batches`).set(hdr(t))).body.data[0].batchId;
    const ret = await request(app).post(`${BASE}/purchase-returns`).set(hdr(t)).set('Idempotency-Key', key()).send({
      supplierId: sup.id, purchaseId: purchase.id, lines: [{ productId: p.id, batchId, unitId: u.strip, qty: 2, reason: 'near_expiry' }],
    });
    expect(ret.status).toBe(201);
    // 2 strips × 132 = 264 + 12% = 295.68 → rounded 296.00
    expect(ret.body.data.totals.taxableMinor).toBe(26_400);
    expect(ret.body.data.totals.grandTotalMinor).toBe(29_600);
    const stock = await request(app).get(`${BASE}/inventory/stock`).set(hdr(t));
    expect(stock.body.data[0].onHandBase).toBe(80);
    const supplier = await request(app).get(`${BASE}/suppliers/${sup.id}`).set(auth(t.accessToken));
    expect(supplier.body.data.balanceMinor).toBe(147_800 - 29_600);
  });

  it('cancelling an unreceived purchase reverses the payable; received ones cannot be cancelled', async () => {
    const t = await registerTenant();
    const sup = await createSupplier(t);
    const p = await createTabletProduct(t);
    const u = await unitIds(t);
    const purchase = await createPurchase(t, sup.id, p.id, u.strip);
    const cancel = await request(app).post(`${BASE}/purchases/${purchase.id}/cancel`).set(auth(t.accessToken)).send({ reason: 'Wrong supplier' });
    expect(cancel.status).toBe(200);
    expect((await request(app).get(`${BASE}/suppliers/${sup.id}`).set(auth(t.accessToken))).body.data.balanceMinor).toBe(0);
    const received = await createPurchase(t, sup.id, p.id, u.strip, { receiveNow: true });
    expect((await request(app).post(`${BASE}/purchases/${received.id}/cancel`).set(auth(t.accessToken)).send({ reason: 'Wrong entry' })).status).toBe(422);
  });

  it('billing staff cannot see purchase cost figures', async () => {
    const t = await registerTenant();
    const sup = await createSupplier(t);
    const p = await createTabletProduct(t);
    const u = await unitIds(t);
    await createPurchase(t, sup.id, p.id, u.strip);
    const staff = await addMember(t, 'billing_staff');
    expect((await request(app).get(`${BASE}/purchases`).set(hdr(t, staff.accessToken))).status).toBe(403);
  });
});
