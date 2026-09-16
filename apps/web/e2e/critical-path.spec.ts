import { test, expect, request as pwRequest, type APIRequestContext, type Page } from '@playwright/test';

const API = process.env.E2E_API_URL ?? 'http://localhost:4000/api/v1';
const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);

interface Tenant { email: string; password: string; token: string; outletId: string }

/** Fresh organization per test through the public register endpoint; returns the owner's token. */
async function registerTenant(api: APIRequestContext): Promise<Tenant> {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const password = 'StrongPassw0rd!';
  const res = await api.post(`${API}/auth/register`, { data: { organizationName: 'E2E Pharmacy', ownerName: 'E2E Owner', email, password, stateCode: '27' } });
  expect(res.status(), await res.text()).toBe(201);
  const body = await res.json();
  return { email, password, token: body.data.accessToken, outletId: body.data.me.outlets[0].id };
}

async function seedProduct(api: APIRequestContext, t: Tenant) {
  const h = { Authorization: `Bearer ${t.token}`, 'X-Outlet-Id': t.outletId };
  const units = await (await api.get(`${API}/units`, { headers: h })).json();
  const byName = new Map<string, string>(units.data.map((u: { name: string; id: string }) => [u.name, u.id]));
  const tablet = byName.get('Tablet')!;
  const strip = byName.get('Strip')!;
  const product = await api.post(`${API}/products`, {
    headers: h,
    data: {
      name: 'Montek LC Tablet', brandName: 'Montek', genericName: 'Montelukast + Levocetirizine', manufacturer: 'Sun Pharma', dosageForm: 'tablet', packLabel: '1x10', hsnCode: '3004',
      tax: { rateBps: 1200, cessBps: 0 }, schedule: 'none', requiresPrescription: false, baseUnitId: tablet, pricingUnitId: strip,
      units: [{ unitId: tablet, factorToBase: 1, allowLooseSale: true }, { unitId: strip, factorToBase: 10, isDefaultSale: true, isDefaultPurchase: true }],
      pricing: { mrpMinor: 18_500, sellingPriceMinor: 18_000, purchasePriceMinor: 13_200 },
    },
  });
  expect(product.status(), await product.text()).toBe(201);
  const p = (await product.json()).data;
  const opening = await api.post(`${API}/inventory/opening-stock`, { headers: { ...h, 'Idempotency-Key': `e2e-${Date.now()}` }, data: { lines: [{ productId: p.id, unitId: strip, qty: 25, batch: { batchNumber: 'B2301', expiryDate: inDays(560), mrpMinor: 18_500, sellingPriceMinor: 18_000, purchasePriceMinor: 13_200 } }] } });
  expect(opening.status(), await opening.text()).toBe(201);
  const supplier = await api.post(`${API}/suppliers`, { headers: h, data: { name: 'Medico Distributors', gstin: '27ABCDE1234F1Z5', stateCode: '27', paymentTermsDays: 30 } });
  expect(supplier.status()).toBe(201);
  return { productId: p.id as string };
}

async function login(page: Page, t: Tenant) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(t.email);
  await page.getByLabel('Password').fill(t.password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test.describe('critical path in the browser', () => {
  test('POS sale: search, add, complete with cash, invoice dialog', async ({ page }) => {
    const api = await pwRequest.newContext();
    const t = await registerTenant(api);
    await seedProduct(api, t);
    await login(page, t);

    await page.goto('/sales/pos');
    const search = page.getByLabel('Search products or scan barcode');
    await search.fill('montek');
    await expect(page.getByRole('listbox').getByRole('option').first()).toContainText('Montek LC Tablet');
    await search.press('Enter');
    await expect(page.getByRole('cell', { name: /Montek LC Tablet/ })).toBeVisible();
    await expect(page.getByText('Grand total').locator('..')).toContainText('₹180.00');

    await page.getByLabel('Quantity').fill('2');
    await expect(page.getByRole('button', { name: /Complete sale · ₹360.00/ })).toBeEnabled();
    await page.keyboard.press('F12');
    await expect(page.getByRole('dialog')).toContainText(/Invoice INV-\d+/);
    await expect(page.getByRole('dialog')).toContainText('₹360.00 · Paid');
  });

  test('purchase with receive-now creates a confirmed GRN and adds stock', async ({ page }) => {
    const api = await pwRequest.newContext();
    const t = await registerTenant(api);
    await seedProduct(api, t);
    await login(page, t);

    await page.goto('/purchases/new');
    await page.getByRole('button', { name: 'Supplier' }).click();
    await page.getByPlaceholder('Type to search…').fill('medico');
    await page.getByRole('listbox').getByRole('option').first().click();
    await page.getByLabel('Invoice no.').fill('MD/2026/0912');

    // first item row
    await page.getByRole('button', { name: 'Search product by name, generic or barcode…' }).first().click();
    await page.getByPlaceholder('Type to search…').fill('montek');
    await page.getByRole('listbox').getByRole('option').first().click();
    await page.getByLabel('Quantity').first().fill('10');
    await page.getByLabel('Free quantity').first().fill('1');
    await page.getByLabel('Batch number').first().fill('B2405');
    await page.getByLabel('Expiry date').first().fill(inDays(470));
    await page.getByLabel('Purchase rate').first().fill('132');
    await expect(page.getByText('Grand total').locator('..')).toContainText('₹1,478.00');

    await page.getByRole('button', { name: 'Save & receive stock' }).click();
    await expect(page.getByRole('heading', { name: /PI-\d+/ })).toBeVisible();
    await expect(page.getByText('Received', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/GRN-\d+/)).toBeVisible();

    await page.goto('/inventory?tab=stock');
    await expect(page.getByRole('cell', { name: /360 tab/ })).toBeVisible();
  });
});
