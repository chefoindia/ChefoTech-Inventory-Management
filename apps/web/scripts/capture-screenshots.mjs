/**
 * Captures real product screenshots for the marketing site.
 *
 * Registers a fresh organization through the API (same as the E2E tests), seeds a small but
 * realistic pharmacy (products, batches, supplier, customers, purchases, sales, credit), signs in
 * with a browser and captures the actual screens into public/screenshots.
 *
 * Requires the api (:4000) and web (:3000) dev servers to be running:
 *   node scripts/capture-screenshots.mjs
 */
import { chromium, request as pwRequest } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API = process.env.E2E_API_URL ?? 'http://localhost:4000/api/v1';
const WEB = process.env.E2E_WEB_URL ?? 'http://localhost:3000';
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/screenshots');
mkdirSync(OUT, { recursive: true });

const inDays = (d) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
const key = () => `shot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function must(res, what) {
  if (res.status() >= 300) throw new Error(`${what}: ${res.status()} ${await res.text()}`);
  return (await res.json()).data;
}

async function seed(api) {
  const email = `demo-${Date.now()}@example.com`;
  const password = 'StrongPassw0rd!';
  const reg = await must(await api.post(`${API}/auth/register`, { data: { organizationName: 'Wellness Pharmacy', ownerName: 'Rakesh Biswal', email, password, stateCode: '27' } }), 'register');
  const token = reg.accessToken;
  const outletId = reg.me.outlets[0].id;
  const h = { Authorization: `Bearer ${token}`, 'X-Outlet-Id': outletId };
  const post = (p, data, idem = false) => api.post(`${API}${p}`, { headers: idem ? { ...h, 'Idempotency-Key': key() } : h, data });

  await must(await api.patch(`${API}/outlets/${outletId}`, { headers: h, data: { name: 'Wellness Pharmacy · Andheri', address: { line1: 'Shop 4, Lokhandwala Complex', city: 'Mumbai', state: 'Maharashtra', pincode: '400053' } } }).catch(() => ({ status: () => 200, json: async () => ({ data: null }) })), 'outlet');
  await must(await post('/outlets', { name: 'Wellness Pharmacy · Powai', code: 'PWI', stateCode: '27' }), 'outlet 2');

  const units = await must(await api.get(`${API}/units`, { headers: h }), 'units');
  const byName = new Map(units.map((u) => [u.name, u.id]));
  const tablet = byName.get('Tablet');
  const strip = byName.get('Strip');
  const bottle = byName.get('Bottle') ?? byName.get('Piece') ?? tablet;
  const piece = byName.get('Piece') ?? tablet;

  const products = [
    { name: 'Montek LC Tablet', brandName: 'Montek', genericName: 'Montelukast 10mg + Levocetirizine 5mg', manufacturer: 'Sun Pharma', pack: '1x10', mrp: 18_500, sell: 18_000, cost: 13_200, qty: 42, expiry: 560, batch: 'MLC2301', reorder: 100 },
    { name: 'Dolo 650 Tablet', brandName: 'Dolo', genericName: 'Paracetamol 650mg', manufacturer: 'Micro Labs', pack: '1x15', mrp: 3_300, sell: 3_200, cost: 2_450, qty: 120, expiry: 700, batch: 'DL6522', reorder: 300, factor: 15 },
    { name: 'Azithral 500 Tablet', brandName: 'Azithral', genericName: 'Azithromycin 500mg', manufacturer: 'Alembic', pack: '1x5', mrp: 11_900, sell: 11_500, cost: 8_900, qty: 18, expiry: 420, batch: 'AZ5081', reorder: 50, factor: 5, schedule: 'H', rx: true },
    { name: 'Pan 40 Tablet', brandName: 'Pan', genericName: 'Pantoprazole 40mg', manufacturer: 'Alkem', pack: '1x15', mrp: 15_600, sell: 15_000, cost: 11_100, qty: 8, expiry: 45, batch: 'PN4077', reorder: 150, factor: 15 },
    { name: 'Telma 40 Tablet', brandName: 'Telma', genericName: 'Telmisartan 40mg', manufacturer: 'Glenmark', pack: '1x15', mrp: 22_100, sell: 21_500, cost: 16_000, qty: 30, expiry: 25, batch: 'TL4019', reorder: 100, factor: 15 },
    { name: 'Crocin Advance Tablet', brandName: 'Crocin', genericName: 'Paracetamol 500mg', manufacturer: 'GSK', pack: '1x15', mrp: 3_000, sell: 3_000, cost: 2_250, qty: 65, expiry: 640, batch: 'CR5540', reorder: 200, factor: 15 },
    { name: 'Shelcal 500 Tablet', brandName: 'Shelcal', genericName: 'Calcium + Vitamin D3', manufacturer: 'Torrent', pack: '1x15', mrp: 11_200, sell: 11_000, cost: 8_300, qty: 22, expiry: 500, batch: 'SH5012', reorder: 100, factor: 15 },
    { name: 'Benadryl Cough Syrup 100ml', brandName: 'Benadryl', genericName: 'Diphenhydramine', manufacturer: 'J&J', pack: '100 ml', mrp: 12_800, sell: 12_500, cost: 9_500, qty: 14, expiry: 300, batch: 'BD1033', reorder: 40, base: bottle, pricing: bottle, factor: 1, dosageForm: 'syrup' },
  ];

  const created = [];
  for (const p of products) {
    const baseUnit = p.base ?? tablet;
    const packUnit = p.pricing ?? strip;
    const factor = p.factor ?? 10;
    const data = {
      name: p.name, brandName: p.brandName, genericName: p.genericName, manufacturer: p.manufacturer, dosageForm: p.dosageForm ?? 'tablet', packLabel: p.pack, hsnCode: '3004',
      tax: { rateBps: 1200, cessBps: 0 }, schedule: p.schedule ?? 'none', requiresPrescription: !!p.rx, baseUnitId: baseUnit, pricingUnitId: packUnit,
      units: factor === 1 ? [{ unitId: baseUnit, factorToBase: 1, allowLooseSale: true, isDefaultSale: true, isDefaultPurchase: true }] : [{ unitId: baseUnit, factorToBase: 1, allowLooseSale: true }, { unitId: packUnit, factorToBase: factor, isDefaultSale: true, isDefaultPurchase: true }],
      pricing: { mrpMinor: p.mrp, sellingPriceMinor: p.sell, purchasePriceMinor: p.cost },
      stockRules: { reorderLevelBase: p.reorder, minStockBase: 0, maxStockBase: 0 },
    };
    const prod = await must(await post('/products', data), `product ${p.name}`);
    await must(await post('/inventory/opening-stock', { lines: [{ productId: prod.id, unitId: packUnit, qty: p.qty, batch: { batchNumber: p.batch, expiryDate: inDays(p.expiry), mrpMinor: p.mrp, sellingPriceMinor: p.sell, purchasePriceMinor: p.cost } }] }, true), `opening ${p.name}`);
    created.push({ ...p, id: prod.id, packUnit, baseUnit });
  }

  const supplier = await must(await post('/suppliers', { name: 'Medico Distributors', gstin: '27ABCDE1234F1Z5', stateCode: '27', paymentTermsDays: 30, phone: '9820012345' }), 'supplier');
  const supplier2 = await must(await post('/suppliers', { name: 'Sai Pharma Agencies', gstin: '27PQRSX5678L1Z2', stateCode: '27', paymentTermsDays: 15, phone: '9820098765' }), 'supplier 2');
  const cust1 = await must(await post('/customers', { name: 'Priya Sharma', phone: '9876543210', creditLimitMinor: 1_000_000 }), 'customer 1');
  const cust2 = await must(await post('/customers', { name: 'Arun Mehta', phone: '9812345678', creditLimitMinor: 500_000 }), 'customer 2');
  await must(await post('/customers', { name: 'Sunita Rao', phone: '9822233344' }), 'customer 3');

  // Purchases: one received, one pending receipt.
  const montek = created[0];
  const dolo = created[1];
  await must(await post('/purchases', { supplierId: supplier.id, supplierInvoiceNumber: 'MD/2026/0912', invoiceDate: inDays(-3), lines: [
    { productId: montek.id, unitId: montek.packUnit, qty: 30, freeQty: 3, batchNumber: 'MLC2405', expiryDate: inDays(600), purchasePriceMinor: 13_200, mrpMinor: 18_500, sellingPriceMinor: 18_000 },
    { productId: dolo.id, unitId: dolo.packUnit, qty: 60, freeQty: 6, batchNumber: 'DL6601', expiryDate: inDays(720), purchasePriceMinor: 2_450, mrpMinor: 3_300, sellingPriceMinor: 3_200 },
  ], receiveNow: true }, true), 'purchase 1');
  await must(await post('/purchases', { supplierId: supplier2.id, supplierInvoiceNumber: 'SPA/1187', invoiceDate: inDays(-1), lines: [
    { productId: created[6].id, unitId: created[6].packUnit, qty: 20, freeQty: 0, batchNumber: 'SH5099', expiryDate: inDays(540), purchasePriceMinor: 8_300, mrpMinor: 11_200, sellingPriceMinor: 11_000 },
  ], receiveNow: false }, true), 'purchase 2');

  // Sales across a few days: cash, UPI, credit.
  const sales = [
    { lines: [{ productId: montek.id, unitId: montek.packUnit, qty: 2 }, { productId: dolo.id, unitId: dolo.packUnit, qty: 1 }], payments: [{ method: 'cash', amountMinor: 39_200 }] },
    { lines: [{ productId: created[5].id, unitId: created[5].packUnit, qty: 2 }, { productId: created[7].id, unitId: created[7].packUnit, qty: 1 }], payments: [{ method: 'upi', amountMinor: 18_500 }] },
    { customerId: cust1.id, lines: [{ productId: created[4].id, unitId: created[4].packUnit, qty: 2 }, { productId: created[3].id, unitId: created[3].packUnit, qty: 1 }], payments: [{ method: 'credit', amountMinor: 58_000 }] },
    { customerId: cust2.id, lines: [{ productId: created[6].id, unitId: created[6].packUnit, qty: 1 }, { productId: dolo.id, unitId: dolo.baseUnit, qty: 5 }], payments: [{ method: 'cash', amountMinor: 5_000 }, { method: 'credit', amountMinor: 7_067 }] },
    { lines: [{ productId: dolo.id, unitId: dolo.packUnit, qty: 3 }], payments: [{ method: 'card', amountMinor: 9_600 }] },
  ];
  for (const s of sales) {
    const quote = await must(await post('/sales/quote', { lines: s.lines, customerId: s.customerId }), 'quote').catch(() => null);
    const total = quote?.totals?.grandTotalMinor;
    const paid = s.payments.filter((p) => p.method !== 'credit');
    const hasCredit = s.payments.some((p) => p.method === 'credit');
    const paidMinor = total && paid.length === 1 && !hasCredit ? total : paid.reduce((sum, p) => sum + p.amountMinor, 0);
    const payments = paid.length ? [{ ...paid[0], amountMinor: paidMinor }] : [];
    const creditMinor = hasCredit && total ? total - paidMinor : undefined;
    const res = await post('/sales', { ...s, payments, ...(creditMinor ? { creditMinor } : {}) }, true);
    if (res.status() >= 300) console.warn('sale skipped:', await res.text());
  }
  // A partial payment against the credit customer.
  await post('/customer-payments', { partyId: cust1.id, amountMinor: 20_000, method: 'upi', reference: 'UPI-8831' }, true);

  return { email, password, token, outletId, montek, cust1 };
}

async function main() {
  const api = await pwRequest.newContext();
  const t = await seed(api);
  console.log('seeded demo organization', t.email);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(`${WEB}/login`);
  await page.getByLabel('Email').fill(t.email);
  await page.getByLabel(/^Password/).fill(t.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(/\/dashboard/);

  const shot = async (name, url, prep) => {
    await page.goto(`${WEB}${url}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(600);
    await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
    if (prep) await prep();
    await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });
    console.log('captured', name);
  };

  await shot('dashboard', '/dashboard');
  await shot('pos', '/sales/pos', async () => {
    const search = page.getByLabel('Search products or scan barcode');
    for (const [q, name] of [['montek', 'Montek'], ['dolo', 'Dolo'], ['benadryl', 'Benadryl'], ['crocin', 'Crocin']]) {
      await search.fill(q);
      const opt = page.getByRole('listbox').getByRole('option', { name: new RegExp(name) }).first();
      await opt.waitFor({ state: 'visible' });
      await opt.click();
      await page.waitForTimeout(300);
    }
    await page.waitForTimeout(800);
  });
  await shot('inventory', '/inventory');
  await shot('batches', `/products/${t.montek.id}`);
  await shot('purchase', '/purchases/new');
  await shot('purchases', '/purchases');
  await shot('customer-ledger', `/customers/${t.cust1.id}`);
  await shot('reports', '/reports/sales.daily');
  await shot('outlets', '/settings/outlets');
  await shot('ai-settings', '/settings/ai');
  await shot('template-designer', '/settings/templates', async () => {
    const first = page.getByRole('link', { name: /edit|open|design/i }).first();
    if (await first.count()) {
      await first.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(800);
    }
  });

  // Phone-sized capture for the responsive section.
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, storageState: await ctx.storageState() });
  const mp = await mobile.newPage();
  await mp.goto(`${WEB}/dashboard`);
  await mp.waitForLoadState('networkidle');
  await mp.waitForTimeout(800);
  await mp.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  await mp.screenshot({ path: path.join(OUT, 'mobile-dashboard.png') });
  console.log('captured mobile-dashboard');

  // PWA icons rendered from the SVG mark.
  const iconPage = await ctx.newPage();
  for (const size of [192, 512]) {
    await iconPage.setViewportSize({ width: size, height: size });
    await iconPage.setContent(`<html><body style="margin:0"><img src="${WEB}/icon.svg" width="${size}" height="${size}" style="display:block"></body></html>`);
    await iconPage.waitForTimeout(200);
    await iconPage.screenshot({ path: path.resolve(OUT, `../icon-${size}.png`), omitBackground: true });
  }
  console.log('icons written');

  await browser.close();
  await api.dispose();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
