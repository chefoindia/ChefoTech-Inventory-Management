import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, BASE, registerTenant, auth, addMember, type TestTenant } from './helpers';

export async function unitIds(t: TestTenant) {
  const res = await request(app).get(`${BASE}/units`).set(auth(t.accessToken));
  const byName = new Map((res.body.data as { id: string; name: string }[]).map((u) => [u.name, u.id]));
  return { tablet: byName.get('Tablet')!, strip: byName.get('Strip')!, box: byName.get('Box')!, bottle: byName.get('Bottle')!, ml: byName.get('Millilitre')! };
}

export async function createTabletProduct(t: TestTenant, overrides: Record<string, unknown> = {}) {
  const u = await unitIds(t);
  const res = await request(app)
    .post(`${BASE}/products`)
    .set(auth(t.accessToken))
    .send({
      name: 'Montek LC',
      brandName: 'Montek',
      genericName: 'Montelukast + Levocetirizine',
      composition: 'Montelukast 10mg, Levocetirizine 5mg',
      manufacturer: 'Sun Pharma',
      dosageForm: 'tablet',
      packLabel: '1x10',
      hsnCode: '3004',
      tax: { rateBps: 1200, cessBps: 0 },
      schedule: 'H',
      requiresPrescription: true,
      baseUnitId: u.tablet,
      pricingUnitId: u.strip,
      units: [
        { unitId: u.tablet, factorToBase: 1, allowLooseSale: true },
        { unitId: u.strip, factorToBase: 10, isDefaultSale: true, isDefaultPurchase: true },
        { unitId: u.box, factorToBase: 100 },
      ],
      pricing: { mrpMinor: 18_500, sellingPriceMinor: 18_500, purchasePriceMinor: 13_200 },
      stockRules: { reorderLevelBase: 50, minStockBase: 20, maxStockBase: 500 },
      barcodes: [{ code: '8901234567890', isPrimary: true }],
      ...overrides,
    });
  if (res.status !== 201) throw new Error(`create product failed: ${JSON.stringify(res.body)}`);
  return res.body.data as { id: string; units: { unitId: string; factorToBase: number }[]; baseUnitId: string; pricingUnitId: string };
}

describe('catalog: units, categories, products', () => {
  it('seeds default units and allows custom units', async () => {
    const t = await registerTenant();
    const list = await request(app).get(`${BASE}/units`).set(auth(t.accessToken));
    expect(list.status).toBe(200);
    expect(list.body.data.map((u: { name: string }) => u.name)).toEqual(expect.arrayContaining(['Tablet', 'Strip', 'Bottle', 'Millilitre']));

    const created = await request(app).post(`${BASE}/units`).set(auth(t.accessToken)).send({ name: 'Blister', abbreviation: 'bl' });
    expect(created.status).toBe(201);
    const dup = await request(app).post(`${BASE}/units`).set(auth(t.accessToken)).send({ name: 'blister', abbreviation: 'b' });
    expect(dup.status).toBe(409);
  });

  it('manages nested categories with path maintenance', async () => {
    const t = await registerTenant();
    const root = await request(app).post(`${BASE}/categories`).set(auth(t.accessToken)).send({ name: 'Medicines' });
    expect(root.status).toBe(201);
    const child = await request(app).post(`${BASE}/categories`).set(auth(t.accessToken)).send({ name: 'Antibiotics', parentId: root.body.data.id });
    expect(child.status).toBe(201);
    expect(child.body.data.path).toBe('Medicines / Antibiotics');

    const renamed = await request(app).patch(`${BASE}/categories/${root.body.data.id}`).set(auth(t.accessToken)).send({ name: 'Pharma' });
    expect(renamed.status).toBe(200);
    const list = await request(app).get(`${BASE}/categories`).set(auth(t.accessToken));
    expect(list.body.data.find((c: { id: string }) => c.id === child.body.data.id).path).toBe('Pharma / Antibiotics');

    const cannot = await request(app).delete(`${BASE}/categories/${root.body.data.id}`).set(auth(t.accessToken));
    expect(cannot.status).toBe(422);
  });

  it('creates a product with units, barcodes and validates unit rules', async () => {
    const t = await registerTenant();
    const product = await createTabletProduct(t);
    expect(product.units).toHaveLength(3);

    const u = await unitIds(t);
    const badBase = await request(app).post(`${BASE}/products`).set(auth(t.accessToken)).send({
      name: 'Bad', baseUnitId: u.tablet, pricingUnitId: u.strip,
      units: [{ unitId: u.tablet, factorToBase: 2 }, { unitId: u.strip, factorToBase: 10 }],
    });
    expect(badBase.status).toBe(400);
    expect(badBase.body.error.details[0].message).toMatch(/factor/);

    const dupBarcode = await request(app).post(`${BASE}/products`).set(auth(t.accessToken)).send({
      name: 'Other', baseUnitId: u.tablet, pricingUnitId: u.tablet,
      units: [{ unitId: u.tablet, factorToBase: 1 }], barcodes: [{ code: '8901234567890' }],
    });
    expect(dupBarcode.status).toBe(409);
    expect(dupBarcode.body.error.message).toMatch(/Montek LC/);
  });

  it('searches by name prefix, generic, composition and barcode', async () => {
    const t = await registerTenant();
    await createTabletProduct(t);
    const u = await unitIds(t);
    await request(app).post(`${BASE}/products`).set(auth(t.accessToken)).send({
      name: 'Crocin Advance', genericName: 'Paracetamol', baseUnitId: u.tablet, pricingUnitId: u.strip,
      units: [{ unitId: u.tablet, factorToBase: 1 }, { unitId: u.strip, factorToBase: 15 }],
    });

    const byName = await request(app).get(`${BASE}/products/search?q=mont`).set(auth(t.accessToken));
    expect(byName.body.data.map((p: { name: string }) => p.name)).toEqual(['Montek LC']);
    const byGeneric = await request(app).get(`${BASE}/products/search?q=parac`).set(auth(t.accessToken));
    expect(byGeneric.body.data.map((p: { name: string }) => p.name)).toEqual(['Crocin Advance']);
    const bySalt = await request(app).get(`${BASE}/products/search?q=levocet`).set(auth(t.accessToken));
    expect(bySalt.body.data).toHaveLength(1);
    const byBarcode = await request(app).get(`${BASE}/products/by-barcode/8901234567890`).set(auth(t.accessToken));
    expect(byBarcode.status).toBe(200);
    expect(byBarcode.body.data.name).toBe('Montek LC');
    const missing = await request(app).get(`${BASE}/products/by-barcode/0000000000000`).set(auth(t.accessToken));
    expect(missing.status).toBe(404);
  });

  it('hides cost price from roles without products.viewCost', async () => {
    const t = await registerTenant();
    const p = await createTabletProduct(t);
    const staff = await addMember(t, 'billing_staff');
    const res = await request(app).get(`${BASE}/products/${p.id}`).set(auth(staff.accessToken));
    expect(res.status).toBe(200);
    expect(res.body.data.pricing.purchasePriceMinor).toBeUndefined();
    expect(res.body.data.pricing.mrpMinor).toBe(18_500);
    const owner = await request(app).get(`${BASE}/products/${p.id}`).set(auth(t.accessToken));
    expect(owner.body.data.pricing.purchasePriceMinor).toBe(13_200);
  });

  it('generates internal EAN-13 barcodes with a valid check digit', async () => {
    const t = await registerTenant();
    const p = await createTabletProduct(t, { barcodes: [] });
    const res = await request(app).post(`${BASE}/products/${p.id}/barcodes/generate`).set(auth(t.accessToken)).send({});
    expect(res.status).toBe(200);
    const code = res.body.data.barcodes[0].code as string;
    expect(code).toMatch(/^2\d{12}$/);
    let sum = 0;
    for (let i = 0; i < 12; i += 1) sum += Number(code[i]) * (i % 2 === 0 ? 1 : 3);
    expect((10 - (sum % 10)) % 10).toBe(Number(code[12]));
  });

  it('validates custom fields server-side', async () => {
    const t = await registerTenant();
    const def = await request(app).post(`${BASE}/custom-fields`).set(auth(t.accessToken)).send({
      entity: 'product', key: 'storage', label: 'Storage', type: 'dropdown', required: true,
      options: [{ label: 'Room temp', value: 'room' }, { label: 'Cold chain', value: 'cold' }],
    });
    expect(def.status).toBe(201);
    const u = await unitIds(t);
    const base = { name: 'Insulin', baseUnitId: u.ml, pricingUnitId: u.ml, units: [{ unitId: u.ml, factorToBase: 1 }] };
    const missing = await request(app).post(`${BASE}/products`).set(auth(t.accessToken)).send(base);
    expect(missing.status).toBe(400);
    expect(missing.body.error.details[0].path).toBe('body.customFields.storage');
    const bad = await request(app).post(`${BASE}/products`).set(auth(t.accessToken)).send({ ...base, customFields: { storage: 'hot' } });
    expect(bad.status).toBe(400);
    const good = await request(app).post(`${BASE}/products`).set(auth(t.accessToken)).send({ ...base, customFields: { storage: 'cold', unknown_key: 'dropped' } });
    expect(good.status).toBe(201);
    expect(good.body.data.customFields).toEqual({ storage: 'cold' });
  });

  it('keeps products isolated between organizations', async () => {
    const a = await registerTenant();
    const b = await registerTenant();
    const p = await createTabletProduct(a);
    expect((await request(app).get(`${BASE}/products/${p.id}`).set(auth(b.accessToken))).status).toBe(404);
    const bList = await request(app).get(`${BASE}/products`).set(auth(b.accessToken));
    expect(bList.body.data).toHaveLength(0);
    // Same barcode is fine in another org.
    const bp = await createTabletProduct(b);
    expect(bp.id).not.toBe(p.id);
  });
});

describe('parties: suppliers & customers', () => {
  it('creates a supplier with opening balance posted to the ledger', async () => {
    const t = await registerTenant();
    const res = await request(app).post(`${BASE}/suppliers`).set(auth(t.accessToken)).send({
      name: 'Medico Distributors', phone: '9876543210', gstin: '27ABCDE1234F1Z5', stateCode: '27', openingBalanceMinor: 250_000, paymentTermsDays: 15,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.balanceMinor).toBe(250_000);
    const ledger = await request(app).get(`${BASE}/suppliers/${res.body.data.id}/ledger`).set(auth(t.accessToken));
    expect(ledger.body.data).toHaveLength(1);
    expect(ledger.body.data[0].type).toBe('opening');
    expect(ledger.body.data[0].balanceAfterMinor).toBe(250_000);

    const adj = await request(app).post(`${BASE}/suppliers/ledger-adjustments`).set(auth(t.accessToken)).send({ partyId: res.body.data.id, amountMinor: -50_000, reason: 'Discount agreed on old dues' });
    expect(adj.status).toBe(201);
    expect(adj.body.data.balanceAfterMinor).toBe(200_000);
  });

  it('creates customers, warns on duplicate phone, searches for POS', async () => {
    const t = await registerTenant();
    const c1 = await request(app).post(`${BASE}/customers`).set(auth(t.accessToken)).send({ name: 'Ravi Kumar', phone: '9000000001', creditLimitMinor: 500_000 });
    expect(c1.status).toBe(201);
    expect(c1.body.data.duplicatePhoneWarning).toBeUndefined();
    const c2 = await request(app).post(`${BASE}/customers`).set(auth(t.accessToken)).send({ name: 'Ravi K', phone: '9000000001' });
    expect(c2.status).toBe(201);
    expect(c2.body.data.duplicatePhoneWarning).toMatch(/same phone/);

    const search = await request(app).get(`${BASE}/customers/search?q=90000`).set(auth(t.accessToken));
    expect(search.body.data).toHaveLength(2);
    const byName = await request(app).get(`${BASE}/customers/search?q=ravi ku`).set(auth(t.accessToken));
    expect(byName.body.data).toHaveLength(1);

    const invalid = await request(app).post(`${BASE}/customers`).set(auth(t.accessToken)).send({ name: 'X', phone: 'abc' });
    expect(invalid.status).toBe(400);
  });

  it('billing staff cannot adjust balances or view supplier ledgers', async () => {
    const t = await registerTenant();
    const staff = await addMember(t, 'billing_staff');
    const sup = await request(app).post(`${BASE}/suppliers`).set(auth(t.accessToken)).send({ name: 'S1' });
    expect((await request(app).get(`${BASE}/suppliers/${sup.body.data.id}/ledger`).set(auth(staff.accessToken))).status).toBe(403);
    expect((await request(app).post(`${BASE}/customers/ledger-adjustments`).set(auth(staff.accessToken)).send({ partyId: sup.body.data.id, amountMinor: 100, reason: 'nope' })).status).toBe(403);
  });
});
