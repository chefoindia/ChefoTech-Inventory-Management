import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, BASE, registerTenant, auth, addMember, type TestTenant } from './helpers';
import { createTabletProduct, unitIds } from './catalog.test';

const key = () => `k-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const hdr = (t: TestTenant, token = t.accessToken) => ({ ...auth(token), 'X-Outlet-Id': t.outletId });

describe('prescriptions', () => {
  it('creates prescriptions for a customer, enforces private files, links to sales', async () => {
    const t = await registerTenant();
    const cust = (await request(app).post(`${BASE}/customers`).set(auth(t.accessToken)).send({ name: 'Asha', phone: '9000000002' })).body.data;
    const pub = await request(app).post(`${BASE}/prescriptions`).set(auth(t.accessToken)).send({
      customerId: cust.id, doctorName: 'Dr. Rao', prescriptionDate: new Date().toISOString(),
      files: [{ provider: 'cloudinary', publicId: 'x/y', resourceType: 'image', format: 'jpg', bytes: 10, access: 'public' }],
    });
    expect(pub.status).toBe(422);
    const rx = await request(app).post(`${BASE}/prescriptions`).set(auth(t.accessToken)).send({
      customerId: cust.id, doctorName: 'Dr. Rao', doctorRegNo: 'MH-1234', prescriptionDate: new Date().toISOString(), validUntil: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      items: [{ medicine: 'Montek LC', dosage: '1-0-1', duration: '5 days' }],
      files: [{ provider: 'cloudinary', publicId: 'x/y', resourceType: 'image', format: 'jpg', bytes: 10, access: 'private' }],
    });
    expect(rx.status).toBe(201);
    expect(rx.body.data.customerName).toBe('Asha');
    expect(rx.body.data.status).toBe('active');

    const p = await createTabletProduct(t, { requiresPrescription: true, schedule: 'H' });
    const u = await unitIds(t);
    await request(app).post(`${BASE}/inventory/opening-stock`).set(hdr(t)).set('Idempotency-Key', key()).send({ lines: [{ productId: p.id, unitId: u.strip, qty: 2, batch: { batchNumber: 'B', expiryDate: new Date(Date.now() + 200 * 86_400_000).toISOString(), mrpMinor: 18_500, purchasePriceMinor: 13_200 } }] });
    const sale = await request(app).post(`${BASE}/sales`).set(hdr(t)).set('Idempotency-Key', key()).send({ customerId: cust.id, prescriptionIds: [rx.body.data.id], lines: [{ productId: p.id, unitId: u.strip, qty: 1 }], payments: [{ method: 'cash', amountMinor: 18_500 }] });
    expect(sale.status).toBe(201);
    const after = await request(app).get(`${BASE}/prescriptions/${rx.body.data.id}`).set(auth(t.accessToken));
    expect(after.body.data.linkedSales).toHaveLength(1);
    expect(after.body.data.linkedSales[0].number).toBe(sale.body.data.number);

    const list = await request(app).get(`${BASE}/prescriptions?customerId=${cust.id}`).set(auth(t.accessToken));
    expect(list.body.data).toHaveLength(1);
    const staff = await addMember(t, 'accountant');
    expect((await request(app).get(`${BASE}/prescriptions`).set(auth(staff.accessToken))).status).toBe(403);
  });
});

describe('import / export', () => {
  it('validates a product CSV, reports errors and duplicates, then commits valid rows', async () => {
    const t = await registerTenant();
    await createTabletProduct(t);
    const csv = [
      'Product name,Base unit,Pack unit,Pack size,MRP,GST %,Barcode,Category',
      'Montek LC,Tablet,Strip,10,185,12,,Tablets',
      'Crocin 650,Tablet,Strip,15,30.50,12,8901111111111,Tablets',
      'Bad Unit,Kilogram,,,,,,',
      ',Tablet,,,,,,',
    ].join('\n');
    const job = await request(app).post(`${BASE}/imports`).set(hdr(t)).send({ entity: 'products', fileName: 'products.csv', csv, duplicateStrategy: 'skip' });
    expect(job.status).toBe(201);
    expect(job.body.data.totalRows).toBe(4);
    expect(job.body.data.validRows).toBe(1);
    expect(job.body.data.duplicateRows).toBe(1);
    expect(job.body.data.invalidRows).toBe(2);
    expect(job.body.data.rows[2].errors[0]).toMatch(/Unknown unit/);
    expect(job.body.data.rows[3].errors[0]).toMatch(/required/);

    const commit = await request(app).post(`${BASE}/imports/${job.body.data.id}/commit`).set(hdr(t));
    expect(commit.status).toBe(200);
    expect(commit.body.data.status).toBe('committed');
    expect(commit.body.data.committedRows).toBe(1);
    const products = await request(app).get(`${BASE}/products?q=crocin`).set(auth(t.accessToken));
    expect(products.body.data).toHaveLength(1);
    expect(products.body.data[0].pricing.mrpMinor).toBe(3_050);
    expect(products.body.data[0].units).toHaveLength(2);
    expect(products.body.data[0].categoryName).toBe('Tablets');
    expect(products.body.data[0].barcodes[0].code).toBe('8901111111111');
    const again = await request(app).post(`${BASE}/imports/${job.body.data.id}/commit`).set(hdr(t));
    expect(again.status).toBe(422);
  });

  it('imports opening stock by product name and posts real movements', async () => {
    const t = await registerTenant();
    const p = await createTabletProduct(t);
    const csv = ['Product name or barcode,Unit,Quantity,Batch,Expiry (YYYY-MM-DD or MM/YYYY),MRP,Purchase price', 'Montek LC,Strip,25,B2301,12/2027,185,132', '8901234567890,,5,B2302,2027-06-30,185,130'].join('\n');
    const job = await request(app).post(`${BASE}/imports`).set(hdr(t)).send({ entity: 'openingStock', fileName: 'stock.csv', csv });
    expect(job.status).toBe(201);
    expect(job.body.data.validRows).toBe(2);
    const commit = await request(app).post(`${BASE}/imports/${job.body.data.id}/commit`).set(hdr(t));
    expect(commit.status).toBe(200);
    const stock = await request(app).get(`${BASE}/inventory/stock`).set(hdr(t));
    expect(stock.body.data[0].productId).toBe(p.id);
    expect(stock.body.data[0].onHandBase).toBe(300);
    expect(stock.body.data[0].batchCount).toBe(2);
  });

  it('exports CSV and XLSX with formula-injection protection and permission checks', async () => {
    const t = await registerTenant();
    await request(app).post(`${BASE}/customers`).set(auth(t.accessToken)).send({ name: '=HYPERLINK("x")', phone: '9000000003' });
    const csv = await request(app).get(`${BASE}/exports/customers?format=csv`).set(hdr(t));
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text).toContain("'=HYPERLINK");
    const xlsx = await request(app).get(`${BASE}/exports/customers?format=xlsx`).set(hdr(t)).buffer(true).parse((res, cb) => { const chunks: Buffer[] = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks))); });
    expect(xlsx.status).toBe(200);
    expect((xlsx.body as Buffer).length).toBeGreaterThan(1000);
    const staff = await addMember(t, 'billing_staff');
    expect((await request(app).get(`${BASE}/exports/customers`).set(hdr(t, staff.accessToken))).status).toBe(403);
    const tmpl = await request(app).get(`${BASE}/imports/template/products`).set(auth(t.accessToken));
    expect(tmpl.text.split('\n')[0]).toContain('Product name');
  });
});
