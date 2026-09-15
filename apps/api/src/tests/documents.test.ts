import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, BASE, registerTenant, auth, addMember, type TestTenant } from './helpers';
import { createTabletProduct, unitIds } from './catalog.test';
import { postOpening } from './inventory.test';
import { amountInWords } from '@/modules/documents/data-providers';

const key = () => `k-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
const hdr = (t: TestTenant, token = t.accessToken) => ({ ...auth(token), 'X-Outlet-Id': t.outletId });
const pdfParser = (res: request.Response, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

async function makeSale(t: TestTenant, extra: Record<string, unknown> = {}) {
  const p = await createTabletProduct(t, { requiresPrescription: false });
  const u = await unitIds(t);
  await postOpening(t, p.id, u.strip, 5, { batchNumber: 'B1', expiryDate: inDays(300), mrpMinor: 18_500, purchasePriceMinor: 13_200 });
  const sale = await request(app).post(`${BASE}/sales`).set(hdr(t)).set('Idempotency-Key', key()).send({ lines: [{ productId: p.id, unitId: u.strip, qty: 2 }, { productId: p.id, unitId: u.tablet, qty: 3 }], payments: [{ method: 'cash', amountMinor: 42_600 }], ...extra });
  if (sale.status !== 201) throw new Error(JSON.stringify(sale.body));
  return sale.body.data as { id: string; number: string };
}

describe('documents & templates', () => {
  it('converts amounts to Indian words', () => {
    expect(amountInWords(48_400)).toBe('Four Hundred Eighty Four Rupees Only');
    expect(amountInWords(1_23_45_678_00 + 5)).toBe('One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight Rupees and Five Paise Only');
    expect(amountInWords(0)).toBe('Zero Rupees');
  });

  it('seeds default templates and renders a sales invoice PDF with history', async () => {
    const t = await registerTenant();
    const list = await request(app).get(`${BASE}/templates`).set(auth(t.accessToken));
    expect(list.status).toBe(200);
    expect(list.body.data.map((x: { documentType: string }) => x.documentType)).toEqual(expect.arrayContaining(['saleInvoice', 'saleReceipt', 'grn', 'paymentReceipt', 'barcodeLabel']));
    expect(list.body.data.every((x: { isDefault: boolean }) => x.isDefault)).toBe(true);

    const sale = await makeSale(t);
    const pdf = await request(app).get(`${BASE}/documents/saleInvoice/${sale.id}`).set(hdr(t)).buffer(true).parse(pdfParser);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    expect((pdf.body as Buffer).length).toBeGreaterThan(2000);

    const receipt = await request(app).get(`${BASE}/documents/saleReceipt/${sale.id}?download=true`).set(hdr(t)).buffer(true).parse(pdfParser);
    expect(receipt.status).toBe(200);
    expect(receipt.headers['content-disposition']).toMatch(/attachment/);

    const history = await request(app).get(`${BASE}/documents/history/Sale/${sale.id}`).set(auth(t.accessToken));
    expect(history.body.data).toHaveLength(2);
    expect(history.body.data.map((h: { documentType: string }) => h.documentType).sort()).toEqual(['saleInvoice', 'saleReceipt']);

    // Re-render returns the stored copy (same template version) - no new history row.
    await request(app).get(`${BASE}/documents/saleInvoice/${sale.id}`).set(hdr(t)).buffer(true).parse(pdfParser);
    const again = await request(app).get(`${BASE}/documents/history/Sale/${sale.id}`).set(auth(t.accessToken));
    expect(again.body.data).toHaveLength(2);
    const stored = await request(app).get(`${BASE}/documents/stored/${history.body.data[0].id}`).set(auth(t.accessToken)).buffer(true).parse(pdfParser);
    expect(stored.status).toBe(200);
  });

  it('customises a template through versions, sets default, restores and previews', async () => {
    const t = await registerTenant();
    const list = await request(app).get(`${BASE}/templates?documentType=saleInvoice`).set(auth(t.accessToken));
    const system = list.body.data[0];
    const dup = await request(app).post(`${BASE}/templates`).set(auth(t.accessToken)).send({ documentType: 'saleInvoice', name: 'Branded', cloneFromId: system.id, layout: system.layout });
    expect(dup.status).toBe(201);
    expect(dup.body.data.isSystem).toBe(false);

    const layout = { ...dup.body.data.layout, elements: [...dup.body.data.layout.elements, { id: 'thanks', type: 'text', x: 0, y: 700, width: 200, height: 12, text: 'Thank you {{customer.name}}', style: { fontSize: 9, bold: true } }] };
    const v2 = await request(app).post(`${BASE}/templates/${dup.body.data.id}/versions`).set(auth(t.accessToken)).send({ layout, note: 'Added thanks line' });
    expect(v2.status).toBe(200);
    expect(v2.body.data.currentVersion).toBe(2);
    expect(v2.body.data.versions).toHaveLength(2);

    const bad = await request(app).post(`${BASE}/templates/${dup.body.data.id}/versions`).set(auth(t.accessToken)).send({ layout: { ...layout, elements: [{ id: 'x', type: 'text', x: -5, y: 0, width: 10, height: 10, text: 'bad' }] } });
    expect(bad.status).toBe(400);

    const preview = await request(app).post(`${BASE}/templates/preview/saleInvoice`).set(hdr(t)).send({ layout }).buffer(true).parse(pdfParser);
    expect(preview.status).toBe(200);
    expect((preview.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

    const def = await request(app).post(`${BASE}/templates/${dup.body.data.id}/default`).set(auth(t.accessToken));
    expect(def.body.data.isDefault).toBe(true);
    const after = await request(app).get(`${BASE}/templates?documentType=saleInvoice`).set(auth(t.accessToken));
    expect(after.body.data.filter((x: { isDefault: boolean }) => x.isDefault)).toHaveLength(1);

    const restored = await request(app).post(`${BASE}/templates/${dup.body.data.id}/versions/1/restore`).set(auth(t.accessToken));
    expect(restored.body.data.currentVersion).toBe(3);
    expect(restored.body.data.layout.elements.find((e: { id: string }) => e.id === 'thanks')).toBeUndefined();

    expect((await request(app).delete(`${BASE}/templates/${system.id}`).set(auth(t.accessToken))).status).toBe(422);
    const staff = await addMember(t, 'billing_staff');
    expect((await request(app).post(`${BASE}/templates`).set(auth(staff.accessToken)).send({ documentType: 'saleInvoice', name: 'x', layout })).status).toBe(403);
  });

  it('emails an invoice through the provider and records status on the sale', async () => {
    const t = await registerTenant();
    const cust = (await request(app).post(`${BASE}/customers`).set(auth(t.accessToken)).send({ name: 'Meera', phone: '9000000009', email: 'meera@example.com' })).body.data;
    const sale = await makeSale(t, { customerId: cust.id });
    const noAddr = await request(app).post(`${BASE}/documents/saleInvoice/${sale.id}/email`).set(hdr(t)).send({ to: 'not-an-email' });
    expect(noAddr.status).toBe(400);
    const sent = await request(app).post(`${BASE}/documents/saleInvoice/${sale.id}/email`).set(hdr(t)).send({ message: 'Get well soon' });
    expect(sent.status).toBe(200);
    expect(sent.body.data.to).toBe('meera@example.com');
    const { emailProvider } = await import('@/services/email/email.service');
    const mail = (emailProvider as unknown as { sent: { to: { email: string }[]; attachments?: { filename: string }[] }[] }).sent.at(-1)!;
    expect(mail.to[0]!.email).toBe('meera@example.com');
    expect(mail.attachments?.[0]?.filename).toBe(`${sale.number}.pdf`);
    const after = await request(app).get(`${BASE}/sales/${sale.id}`).set(auth(t.accessToken));
    expect(after.body.data.emailStatus).toBe('sent');
    expect(after.body.data.emailedTo).toBe('meera@example.com');

    // sendEmail on the sale itself triggers the event handler.
    const p2 = (await request(app).get(`${BASE}/products`).set(auth(t.accessToken))).body.data[0];
    const u = await unitIds(t);
    const auto = await request(app).post(`${BASE}/sales`).set(hdr(t)).set('Idempotency-Key', key()).send({ customerId: cust.id, lines: [{ productId: p2.id, unitId: u.tablet, qty: 1 }], payments: [{ method: 'cash', amountMinor: 1_900 }], sendEmail: true });
    expect(auto.status).toBe(201);
    await new Promise((r) => setTimeout(r, 400));
    const autoSale = await request(app).get(`${BASE}/sales/${auto.body.data.id}`).set(auth(t.accessToken));
    expect(['sent', 'queued']).toContain(autoSale.body.data.emailStatus);
  });

  it('renders every document type from sample data without errors', async () => {
    const t = await registerTenant();
    const list = await request(app).get(`${BASE}/templates`).set(auth(t.accessToken));
    for (const tmpl of list.body.data as { documentType: string; layout: unknown }[]) {
      const res = await request(app).post(`${BASE}/templates/preview/${tmpl.documentType}`).set(hdr(t)).send({ layout: tmpl.layout }).buffer(true).parse(pdfParser);
      expect(res.status, tmpl.documentType).toBe(200);
      expect((res.body as Buffer).length, tmpl.documentType).toBeGreaterThan(800);
    }
  });
});
