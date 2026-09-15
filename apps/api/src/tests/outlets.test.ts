import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, BASE, registerTenant, auth } from './helpers';

describe('outlets & organization', () => {
  it('creates, updates, lists and archives outlets with validation and plan limits', async () => {
    const t = await registerTenant();

    const bad = await request(app).post(`${BASE}/outlets`).set(auth(t.accessToken)).send({ name: 'B', code: 'x!', stateCode: '99' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.map((d: { path: string }) => d.path)).toEqual(
      expect.arrayContaining(['body.name', 'body.code', 'body.stateCode']),
    );

    const b1 = await request(app).post(`${BASE}/outlets`).set(auth(t.accessToken)).send({ name: 'Branch 1', code: 'br1', stateCode: '27', gstin: '27ABCDE1234F1Z5' });
    expect(b1.status).toBe(201);
    expect(b1.body.data.code).toBe('BR1');
    expect(b1.body.data.isDefault).toBe(false);

    const dup = await request(app).post(`${BASE}/outlets`).set(auth(t.accessToken)).send({ name: 'Branch dup', code: 'BR1', stateCode: '27' });
    expect(dup.status).toBe(409);

    const b2 = await request(app).post(`${BASE}/outlets`).set(auth(t.accessToken)).send({ name: 'Branch 2', code: 'BR2', stateCode: '29' });
    expect(b2.status).toBe(201);

    // Trial plan allows 3 outlets.
    const over = await request(app).post(`${BASE}/outlets`).set(auth(t.accessToken)).send({ name: 'Branch 3', code: 'BR3', stateCode: '29' });
    expect(over.status).toBe(402);
    expect(over.body.error.code).toBe('PLAN_LIMIT');

    const upd = await request(app).patch(`${BASE}/outlets/${b1.body.data.id}`).set(auth(t.accessToken)).send({ name: 'Branch One', settings: { defaultPrinter: 'thermal80' } });
    expect(upd.status).toBe(200);
    expect(upd.body.data.name).toBe('Branch One');
    expect(upd.body.data.settings.defaultPrinter).toBe('thermal80');
    expect(upd.body.data.settings.autoPrintOnSale).toBe(false);

    const noDefault = await request(app).post(`${BASE}/outlets/${t.outletId}/archive`).set(auth(t.accessToken));
    expect(noDefault.status).toBe(422);

    const arch = await request(app).post(`${BASE}/outlets/${b2.body.data.id}/archive`).set(auth(t.accessToken));
    expect(arch.status).toBe(200);
    expect(arch.body.data.status).toBe('archived');

    const list = await request(app).get(`${BASE}/outlets`).set(auth(t.accessToken));
    expect(list.body.data).toHaveLength(2);
    const all = await request(app).get(`${BASE}/outlets?includeArchived=true`).set(auth(t.accessToken));
    expect(all.body.data).toHaveLength(3);

    const audit = await request(app).get(`${BASE}/audit-logs?entityType=Outlet`).set(auth(t.accessToken));
    expect(audit.body.data.map((l: { action: string }) => l.action)).toEqual(
      expect.arrayContaining(['outlet.created', 'outlet.updated', 'outlet.archived']),
    );
  });

  it('updates organization profile and merges settings without wiping siblings', async () => {
    const t = await registerTenant();
    const res = await request(app)
      .patch(`${BASE}/organization`)
      .set(auth(t.accessToken))
      .send({
        legalName: 'Apollo Care Pvt Ltd',
        tax: { gstin: '27ABCDE1234F1Z5', pan: 'ABCDE1234F' },
        settings: { sales: { maxDiscountBps: 1500 }, numbering: { sale: { prefix: 'AC', padding: 5, resetOnFinancialYear: true, perOutlet: true } } },
      });
    expect(res.status).toBe(200);
    expect(res.body.data.legalName).toBe('Apollo Care Pvt Ltd');
    expect(res.body.data.tax.gstin).toBe('27ABCDE1234F1Z5');
    expect(res.body.data.tax.stateCode).toBe('27');
    expect(res.body.data.settings.sales.maxDiscountBps).toBe(1500);
    expect(res.body.data.settings.sales.defaultCreditDays).toBe(30);
    expect(res.body.data.settings.numbering.sale.prefix).toBe('AC');

    const badGst = await request(app).patch(`${BASE}/organization`).set(auth(t.accessToken)).send({ tax: { gstin: 'NOPE' } });
    expect(badGst.status).toBe(400);

    const again = await request(app).get(`${BASE}/organization`).set(auth(t.accessToken));
    expect(again.body.data.settings.numbering.sale.padding).toBe(5);
  });
});
