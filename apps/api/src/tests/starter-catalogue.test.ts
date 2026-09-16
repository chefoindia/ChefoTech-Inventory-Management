import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { STARTER_MEDICINES } from '@pharmaos/shared';
import { app, BASE, registerTenant, addMember, auth, type TestTenant } from './helpers';

const hdr = (t: TestTenant, token = t.accessToken) => ({ ...auth(token), 'X-Outlet-Id': t.outletId });

describe('starter catalogue: common medicines for a new pharmacy', () => {
  it('lists the catalogue with nothing marked as added for a brand-new organization', async () => {
    const t = await registerTenant();
    const res = await request(app).get(`${BASE}/products/starter-catalogue`).set(hdr(t));
    expect(res.status, res.text).toBe(200);
    expect(res.body.data.length).toBe(STARTER_MEDICINES.length);
    expect(res.body.data.every((m: { alreadyAdded: boolean }) => !m.alreadyAdded)).toBe(true);
    // Every entry carries what a product needs, and no invented prices.
    for (const m of res.body.data) {
      expect(m.name.length).toBeGreaterThan(2);
      expect(m.composition.length).toBeGreaterThan(2);
      expect(m.baseUnit.length).toBeGreaterThan(0);
      expect(m.gstRateBps).toBeGreaterThanOrEqual(0);
      expect(m).not.toHaveProperty('mrpMinor');
    }
  });

  it('creates the chosen medicines as real products with units, pack size and tax, and no prices', async () => {
    const t = await registerTenant();
    const dolo = STARTER_MEDICINES.find((m) => m.key === 'dolo-650')!;
    const syrup = STARTER_MEDICINES.find((m) => m.key === 'benadryl-syrup')!;
    const thermometer = STARTER_MEDICINES.find((m) => m.key === 'thermometer-digital')!;

    const add = await request(app).post(`${BASE}/products/starter-catalogue`).set(hdr(t)).send({ keys: [dolo.key, syrup.key, thermometer.key] });
    expect(add.status, add.text).toBe(201);
    expect(add.body.data).toMatchObject({ added: 3, skipped: [], failed: [] });

    const list = await request(app).get(`${BASE}/products`).set(hdr(t)).query({ page: 1, pageSize: 50 });
    expect(list.status).toBe(200);
    const byName = new Map<string, Record<string, never>>(list.body.data.map((p: { name: string }) => [p.name, p as never]));
    expect(byName.size).toBe(3);

    const tablet = list.body.data.find((p: { name: string }) => p.name === dolo.name);
    expect(tablet.composition).toBe(dolo.composition);
    expect(tablet.manufacturer).toBe(dolo.manufacturer);
    expect(tablet.tax.rateBps).toBe(dolo.gstRateBps);
    // Base unit is the tablet, the strip is the pack that holds 15 of them and is the default for sale.
    const strip = tablet.units.find((u: { factorToBase: number }) => u.factorToBase === 15);
    expect(strip).toBeTruthy();
    expect(strip.isDefaultSale).toBe(true);
    expect(tablet.pricingUnitId).toBe(strip.unitId);
    // Prices are never invented: they arrive with the first purchase.
    expect(tablet.pricing).toMatchObject({ mrpMinor: 0, sellingPriceMinor: 0, purchasePriceMinor: 0 });

    // A syrup is stocked in millilitres inside a bottle.
    const bottle = list.body.data.find((p: { name: string }) => p.name === syrup.name);
    expect(bottle.units.some((u: { factorToBase: number }) => u.factorToBase === 100)).toBe(true);

    // A device has a single unit and no pack.
    const device = list.body.data.find((p: { name: string }) => p.name === thermometer.name);
    expect(device.units).toHaveLength(1);
    expect(device.units[0].factorToBase).toBe(1);
  });

  it('flags what is already stocked and never creates a duplicate', async () => {
    const t = await registerTenant();
    await request(app).post(`${BASE}/products/starter-catalogue`).set(hdr(t)).send({ keys: ['dolo-650'] });

    const listed = await request(app).get(`${BASE}/products/starter-catalogue`).set(hdr(t));
    expect(listed.body.data.find((m: { key: string }) => m.key === 'dolo-650').alreadyAdded).toBe(true);

    const again = await request(app).post(`${BASE}/products/starter-catalogue`).set(hdr(t)).send({ keys: ['dolo-650', 'crocin-advance'] });
    expect(again.status).toBe(201);
    expect(again.body.data.added).toBe(1);
    expect(again.body.data.skipped).toEqual(['Dolo 650 Tablet']);

    const products = await request(app).get(`${BASE}/products`).set(hdr(t)).query({ page: 1, pageSize: 50 });
    expect(products.body.data.filter((p: { name: string }) => p.name === 'Dolo 650 Tablet')).toHaveLength(1);
  });

  it('refuses unknown keys and requires permission to create products', async () => {
    const t = await registerTenant();
    const bad = await request(app).post(`${BASE}/products/starter-catalogue`).set(hdr(t)).send({ keys: ['not-a-real-medicine'] });
    expect(bad.status).toBe(422);

    const cashier = await addMember(t, 'billing_staff');
    const forbidden = await request(app).post(`${BASE}/products/starter-catalogue`).set(hdr(t, cashier.accessToken)).send({ keys: ['dolo-650'] });
    expect(forbidden.status).toBe(403);
  });
});
