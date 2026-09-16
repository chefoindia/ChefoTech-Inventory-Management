import { test, expect, request as pwRequest } from '@playwright/test';

const API = process.env.E2E_API_URL ?? 'http://localhost:4000/api/v1';

test('a new pharmacy can fill its catalogue from the common medicines list in one click', async ({ page }) => {
  const api = await pwRequest.newContext();
  const email = `e2e-starter-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const password = 'StrongPassw0rd!';
  const res = await api.post(`${API}/auth/register`, { data: { organizationName: 'Starter Pharmacy', ownerName: 'E2E Owner', email, password, stateCode: '27' } });
  expect(res.status(), await res.text()).toBe(201);
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  // The empty product list offers the shortcut instead of only "add one by one".
  await page.goto('/products');
  await page.getByRole('link', { name: /add common medicines/i }).click();
  await expect(page).toHaveURL(/\/products\/starter/);

  // Essentials are pre-ticked, so the owner can simply continue.
  const cta = page.getByRole('button', { name: /continue and add/i });
  const label = (await cta.textContent()) ?? '';
  const selected = Number(/(\d+)/.exec(label)?.[1] ?? '0');
  expect(selected, 'essentials should be pre-selected').toBeGreaterThan(20);

  await cta.click();
  await expect(page.getByRole('heading', { name: /medicines added/i })).toBeVisible({ timeout: 60_000 });

  // They are real products, searchable, with pack and tax filled in and prices left to the first purchase.
  await page.goto('/products');
  await expect(page.getByText(`${selected} products`)).toBeVisible();
  await page.getByPlaceholder(/search name, generic/i).fill('paracetamol');
  await expect(page.getByText('Dolo 650 Tablet')).toBeVisible();

  // Going back offers no duplicates: everything added is marked as such.
  await page.goto('/products/starter');
  await expect(page.getByText('Already added').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /continue and add/i })).toBeDisabled();
});
