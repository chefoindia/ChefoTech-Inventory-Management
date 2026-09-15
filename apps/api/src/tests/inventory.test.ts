import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, BASE, registerTenant, auth, addMember, type TestTenant } from './helpers';
import { createTabletProduct, unitIds } from './catalog.test';

const key = () => `k-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

function outletHeaders(t: TestTenant, token = t.accessToken, outletId = t.outletId) {
  return { ...auth(token), 'X-Outlet-Id': outletId };
}

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);

export async function postOpening(t: TestTenant, productId: string, unitId: string, qty: number, batch: Record<string, unknown>) {
  const res = await request(app)
    .post(`${BASE}/inventory/opening-stock`)
    .set(outletHeaders(t))
    .set('Idempotency-Key', key())
    .send({ lines: [{ productId, unitId, qty, batch }] });
  if (res.status !== 201) throw new Error(`opening failed: ${JSON.stringify(res.body)}`);
  return res.body.data;
}

describe('inventory: opening stock, batches, movements', () => {
  it('posts opening stock in strips and reports it in base units with FEFO batches', async () => {
    const t = await registerTenant();
    const p = await createTabletProduct(t);
    const u = await unitIds(t);
    await postOpening(t, p.id, u.strip, 5, { batchNumber: 'B-LATE', expiryDate: inDays(365), mrpMinor: 18_500, purchasePriceMinor: 13_200 });
    await postOpening(t, p.id, u.strip, 3, { batchNumber: 'B-SOON', expiryDate: inDays(45), mrpMinor: 18_500, purchasePriceMinor: 13_000 });

    const stock = await request(app).get(`${BASE}/inventory/stock`).set(outletHeaders(t));
    expect(stock.status).toBe(200);
    const row = stock.body.data[0];
    expect(row.onHandBase).toBe(80);
    expect(row.batchCount).toBe(2);
    expect(row.valuationCostMinor).toBe(5 * 13_200 + 3 * 13_000);
    expect(row.isLow).toBe(false);

    const search = await request(app).get(`${BASE}/products/search?q=montek&withStock=true`).set(outletHeaders(t));
    expect(search.body.data[0].stockBase).toBe(80);
    expect(search.body.data[0].batches.map((b: { batchNumber: string }) => b.batchNumber)).toEqual(['B-SOON', 'B-LATE']);

    const movements = await request(app).get(`${BASE}/inventory/movements`).set(outletHeaders(t));
    expect(movements.body.data).toHaveLength(2);
    expect(movements.body.data[0].reason).toBe('opening');
    expect(movements.body.data[0].balanceAfterBase).toBe(30);

    const batches = await request(app).get(`${BASE}/inventory/batches?expiryStatus=expiring&withinDays=60`).set(outletHeaders(t));
    expect(batches.body.data).toHaveLength(1);
    expect(batches.body.data[0].batchNumber).toBe('B-SOON');
  });

  it('rejects fractional base quantities and unknown units', async () => {
    const t = await registerTenant();
    const p = await createTabletProduct(t);
    const u = await unitIds(t);
    const res = await request(app).post(`${BASE}/inventory/opening-stock`).set(outletHeaders(t)).set('Idempotency-Key', key()).send({
      lines: [{ productId: p.id, unitId: u.strip, qty: 1.25, batch: { batchNumber: 'X', expiryDate: inDays(100), mrpMinor: 100, purchasePriceMinor: 50 } }],
    });
    expect(res.status).toBe(400);
    const bad = await request(app).post(`${BASE}/inventory/opening-stock`).set(outletHeaders(t)).set('Idempotency-Key', key()).send({
      lines: [{ productId: p.id, unitId: u.ml, qty: 1, batch: { batchNumber: 'X', expiryDate: inDays(100), mrpMinor: 100, purchasePriceMinor: 50 } }],
    });
    expect(bad.status).toBe(400);
  });

  it('applies adjustments immediately for approvers and queues them above the threshold for others', async () => {
    const t = await registerTenant();
    const p = await createTabletProduct(t);
    const u = await unitIds(t);
    await postOpening(t, p.id, u.strip, 10, { batchNumber: 'B1', expiryDate: inDays(300), mrpMinor: 18_500, purchasePriceMinor: 13_200 });
    const batchId = (await request(app).get(`${BASE}/inventory/batches`).set(outletHeaders(t))).body.data[0].batchId;

    // Owner approves implicitly.
    const dmg = await request(app).post(`${BASE}/inventory/adjustments`).set(outletHeaders(t)).set('Idempotency-Key', key()).send({
      type: 'damage', reason: 'breakage', lines: [{ productId: p.id, batchId, unitId: u.tablet, qtyDelta: -4, note: 'Dropped' }],
    });
    expect(dmg.status).toBe(201);
    expect(dmg.body.data.status).toBe('approved');
    expect(dmg.body.data.totalValueMinor).toBe(Math.round((4 * 13_200) / 10));

    // Lower threshold so a pharmacist's adjustment needs approval.
    await request(app).patch(`${BASE}/organization`).set(auth(t.accessToken)).send({ settings: { inventory: { adjustmentApprovalThresholdMinor: 1000 } } });
    const pharmacist = await addMember(t, 'pharmacist');
    const pending = await request(app).post(`${BASE}/inventory/adjustments`).set(outletHeaders(t, pharmacist.accessToken)).set('Idempotency-Key', key()).send({
      type: 'decrease', reason: 'physical_count', lines: [{ productId: p.id, batchId, unitId: u.strip, qtyDelta: -2 }],
    });
    expect(pending.status).toBe(201);
    expect(pending.body.data.status).toBe('pending_approval');

    let stock = await request(app).get(`${BASE}/inventory/stock`).set(outletHeaders(t));
    expect(stock.body.data[0].onHandBase).toBe(96);

    const cannotSelf = await request(app).post(`${BASE}/inventory/adjustments/${pending.body.data.id}/approve`).set(outletHeaders(t, pharmacist.accessToken));
    expect(cannotSelf.status).toBe(403);

    const approve = await request(app).post(`${BASE}/inventory/adjustments/${pending.body.data.id}/approve`).set(outletHeaders(t));
    expect(approve.status).toBe(200);
    stock = await request(app).get(`${BASE}/inventory/stock`).set(outletHeaders(t));
    expect(stock.body.data[0].onHandBase).toBe(76);

    // Cannot take stock below zero.
    const tooMuch = await request(app).post(`${BASE}/inventory/adjustments`).set(outletHeaders(t)).set('Idempotency-Key', key()).send({
      type: 'lost', reason: 'lost_theft', lines: [{ productId: p.id, batchId, unitId: u.strip, qtyDelta: -20 }],
    });
    expect(tooMuch.status).toBe(422);
    expect(tooMuch.body.error.message).toMatch(/Insufficient stock/);
  });

  it('excludes expired batches from sellable stock and summarises expiry buckets', async () => {
    const t = await registerTenant();
    const p = await createTabletProduct(t);
    const u = await unitIds(t);
    await postOpening(t, p.id, u.strip, 2, { batchNumber: 'OLD', expiryDate: inDays(-1), mrpMinor: 100, purchasePriceMinor: 50 });
    await postOpening(t, p.id, u.strip, 4, { batchNumber: 'NEW', expiryDate: inDays(20), mrpMinor: 100, purchasePriceMinor: 50 });

    const stock = await request(app).get(`${BASE}/inventory/stock`).set(outletHeaders(t));
    expect(stock.body.data[0].onHandBase).toBe(60);
    expect(stock.body.data[0].expiredBase).toBe(20);
    expect(stock.body.data[0].sellableBase).toBe(40);

    const search = await request(app).get(`${BASE}/products/search?q=montek&withStock=true`).set(outletHeaders(t));
    expect(search.body.data[0].stockBase).toBe(40);

    const summary = await request(app).get(`${BASE}/inventory/expiry`).set(outletHeaders(t));
    expect(summary.body.data.expired.qtyBase).toBe(20);
    expect(summary.body.data.buckets[0]).toMatchObject({ days: 30, qtyBase: 40 });

    const expiredBatch = (await request(app).get(`${BASE}/inventory/batches?expiryStatus=expired`).set(outletHeaders(t))).body.data[0];
    const writeOff = await request(app).post(`${BASE}/inventory/write-off`).set(outletHeaders(t)).set('Idempotency-Key', key()).send({ batchId: expiredBatch.batchId, qtyBase: 20, kind: 'expiry', note: 'Expired stock' });
    expect(writeOff.status).toBe(201);
    const after = await request(app).get(`${BASE}/inventory/stock`).set(outletHeaders(t));
    expect(after.body.data[0].onHandBase).toBe(40);
    expect(after.body.data[0].expiredBase).toBe(0);
  });

  it('flags low stock against the reorder level', async () => {
    const t = await registerTenant();
    const p = await createTabletProduct(t, { stockRules: { reorderLevelBase: 30, minStockBase: 10, maxStockBase: 500 } });
    const u = await unitIds(t);
    await postOpening(t, p.id, u.strip, 2, { batchNumber: 'B', expiryDate: inDays(200), mrpMinor: 100, purchasePriceMinor: 50 });
    const low = await request(app).get(`${BASE}/inventory/low-stock`).set(outletHeaders(t));
    expect(low.body.data).toHaveLength(1);
    expect(low.body.data[0].isLow).toBe(true);
  });

  it('keeps stock per outlet and isolates organizations', async () => {
    const t = await registerTenant();
    const branch = await request(app).post(`${BASE}/outlets`).set(auth(t.accessToken)).send({ name: 'Branch', code: 'BR', stateCode: '27' });
    const p = await createTabletProduct(t);
    const u = await unitIds(t);
    await postOpening(t, p.id, u.strip, 1, { batchNumber: 'B', expiryDate: inDays(200), mrpMinor: 100, purchasePriceMinor: 50 });
    const branchStock = await request(app).get(`${BASE}/inventory/stock`).set(outletHeaders(t, t.accessToken, branch.body.data.id));
    expect(branchStock.body.data[0].onHandBase).toBe(0);

    const other = await registerTenant();
    const foreign = await request(app).get(`${BASE}/inventory/movements`).set(outletHeaders(other));
    expect(foreign.body.data).toHaveLength(0);
  });
});

describe('inventory: transfers', () => {
  it('runs request → dispatch → receive with a discrepancy written off at the source', async () => {
    const t = await registerTenant();
    const branch = (await request(app).post(`${BASE}/outlets`).set(auth(t.accessToken)).send({ name: 'Branch', code: 'BR', stateCode: '27' })).body.data;
    const p = await createTabletProduct(t);
    const u = await unitIds(t);
    await postOpening(t, p.id, u.strip, 10, { batchNumber: 'B1', expiryDate: inDays(300), mrpMinor: 18_500, purchasePriceMinor: 13_200 });
    const batchId = (await request(app).get(`${BASE}/inventory/batches`).set(outletHeaders(t))).body.data[0].batchId;

    const created = await request(app).post(`${BASE}/transfers`).set(outletHeaders(t)).set('Idempotency-Key', key()).send({
      toOutletId: branch.id, lines: [{ productId: p.id, batchId, unitId: u.strip, qty: 4 }],
    });
    expect(created.status).toBe(201);
    expect(created.body.data.status).toBe('requested');

    const dispatched = await request(app).post(`${BASE}/transfers/${created.body.data.id}/dispatch`).set(outletHeaders(t));
    expect(dispatched.status).toBe(200);
    expect(dispatched.body.data.status).toBe('dispatched');

    let src = await request(app).get(`${BASE}/inventory/stock`).set(outletHeaders(t));
    expect(src.body.data[0].onHandBase).toBe(60);
    expect(src.body.data[0].inTransitBase).toBe(40);

    const lineId = dispatched.body.data.lines[0].lineId;
    const received = await request(app).post(`${BASE}/transfers/${created.body.data.id}/receive`).set(outletHeaders(t, t.accessToken, branch.id)).send({
      lines: [{ lineId, qtyReceivedBase: 35, discrepancyNote: 'One strip crushed in transit' }],
    });
    expect(received.status).toBe(200);
    expect(received.body.data.status).toBe('partially_received');

    const dst = await request(app).get(`${BASE}/inventory/stock`).set(outletHeaders(t, t.accessToken, branch.id));
    expect(dst.body.data[0].onHandBase).toBe(35);
    src = await request(app).get(`${BASE}/inventory/stock`).set(outletHeaders(t));
    expect(src.body.data[0].onHandBase).toBe(60);
    expect(src.body.data[0].inTransitBase).toBe(0);
    const lost = await request(app).get(`${BASE}/inventory/movements?reason=lost`).set(outletHeaders(t));
    expect(lost.body.data).toHaveLength(1);
    expect(lost.body.data[0].qtyBaseDelta).toBe(-5);
  });

  it('cancelling a dispatched transfer returns stock to the source', async () => {
    const t = await registerTenant();
    const branch = (await request(app).post(`${BASE}/outlets`).set(auth(t.accessToken)).send({ name: 'Branch', code: 'BR', stateCode: '27' })).body.data;
    const p = await createTabletProduct(t);
    const u = await unitIds(t);
    await postOpening(t, p.id, u.strip, 5, { batchNumber: 'B1', expiryDate: inDays(300), mrpMinor: 100, purchasePriceMinor: 50 });
    const batchId = (await request(app).get(`${BASE}/inventory/batches`).set(outletHeaders(t))).body.data[0].batchId;
    const created = await request(app).post(`${BASE}/transfers`).set(outletHeaders(t)).set('Idempotency-Key', key()).send({
      toOutletId: branch.id, lines: [{ productId: p.id, batchId, unitId: u.strip, qty: 2 }], dispatchNow: true,
    });
    expect(created.body.data.status).toBe('dispatched');
    const cancel = await request(app).post(`${BASE}/transfers/${created.body.data.id}/cancel`).set(outletHeaders(t)).send({ reason: 'Sent by mistake' });
    expect(cancel.status).toBe(200);
    const src = await request(app).get(`${BASE}/inventory/stock`).set(outletHeaders(t));
    expect(src.body.data[0].onHandBase).toBe(50);
    expect(src.body.data[0].inTransitBase).toBe(0);
  });
});
