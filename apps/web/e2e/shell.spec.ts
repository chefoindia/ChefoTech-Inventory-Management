import { test, expect, request as pwRequest, type APIRequestContext, type Page } from '@playwright/test';

const API = process.env.E2E_API_URL ?? 'http://localhost:4000/api/v1';

async function registerAndLogin(page: Page, api: APIRequestContext) {
  const email = `e2e-shell-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const password = 'StrongPassw0rd!';
  const res = await api.post(`${API}/auth/register`, { data: { organizationName: 'Shell Pharmacy', ownerName: 'E2E Owner', email, password, stateCode: '27' } });
  expect(res.status(), await res.text()).toBe(201);
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test.describe('application shell and sign-in', () => {
  test('password fields have a working show/hide toggle', async ({ page }) => {
    await page.goto('/login');
    const field = page.getByLabel(/^Password/);
    await field.fill('SecretPass123');
    await expect(field).toHaveAttribute('type', 'password');
    await page.getByRole('button', { name: 'Show password' }).click();
    await expect(field).toHaveAttribute('type', 'text');
    await expect(field).toHaveValue('SecretPass123');
    await page.getByRole('button', { name: 'Hide password' }).click();
    await expect(field).toHaveAttribute('type', 'password');
    // The signup screen has the same affordance.
    await page.goto('/register');
    await expect(page.getByRole('button', { name: 'Show password' })).toBeVisible();
  });

  test('sidebar and header stay in place while the page scrolls', async ({ page }) => {
    const api = await pwRequest.newContext();
    await page.setViewportSize({ width: 1440, height: 800 });
    await registerAndLogin(page, api);
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => window.scrollTo(0, 600));
    await page.waitForTimeout(300);
    const box = await page.evaluate(() => {
      const aside = document.querySelector('aside')!.getBoundingClientRect();
      const header = document.querySelector('header')!.getBoundingClientRect();
      return { scrollY: window.scrollY, asideTop: aside.top, asideHeight: aside.height, headerTop: header.top, headerHeight: header.height, viewport: window.innerHeight };
    });
    expect(box.scrollY, 'the dashboard should be tall enough to scroll').toBeGreaterThan(100);
    expect(box.asideTop, 'the sidebar must not scroll away with the page').toBe(0);
    expect(box.asideHeight, 'the sidebar should span the viewport').toBeGreaterThanOrEqual(box.viewport - 1);
    expect(box.headerTop, 'the header must stay pinned').toBe(0);
    expect(box.headerHeight, 'the header should keep its full height').toBeGreaterThanOrEqual(64);
  });

  test('content fills the window on wide screens instead of leaving growing side gaps', async ({ page }) => {
    const api = await pwRequest.newContext();
    await page.setViewportSize({ width: 1280, height: 800 });
    await registerAndLogin(page, api);
    // A zoomed-out browser reports a much wider viewport; the layout must use it.
    await page.setViewportSize({ width: 2400, height: 900 });
    for (const path of ['/dashboard', '/sales', '/inventory']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const w = await page.evaluate(() => {
        const main = document.querySelector('main')!.getBoundingClientRect();
        const aside = document.querySelector('aside')!.getBoundingClientRect();
        return { main: main.width, aside: aside.width, inner: window.innerWidth };
      });
      expect(w.main + w.aside, `${path} should use the full window width`).toBeGreaterThanOrEqual(w.inner - 2);
    }
  });
});
