import { test, expect, request as pwRequest, type Page, type APIRequestContext } from '@playwright/test';

const API = process.env.E2E_API_URL ?? 'http://localhost:4000/api/v1';
const PUBLIC_PAGES = ['/', '/features', '/pricing', '/faq', '/contact', '/pharmacy-billing-software', '/ai-pharmacy-assistant', '/login', '/register'];
const APP_PAGES = ['/dashboard', '/sales/pos', '/inventory', '/products', '/purchases/new', '/customers', '/reports', '/settings/organization', '/settings/ai'];
const VIEWPORTS = [
  { name: 'small phone', width: 360, height: 740 },
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
];

async function noHorizontalOverflow(page: Page, label: string) {
  const { scrollWidth, innerWidth, culprits } = await page.evaluate(() => {
    const w = window.innerWidth;
    const culprits: string[] = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.right > w + 1) culprits.push(`${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 4).join('.')} (w=${Math.round(r.width)}, right=${Math.round(r.right)})`);
    }
    return { scrollWidth: document.documentElement.scrollWidth, innerWidth: w, culprits: culprits.slice(0, 5) };
  });
  expect(scrollWidth, `${label}: page scrolls horizontally (${scrollWidth} > ${innerWidth}); widest: ${culprits.join(' | ') || 'none measured'}`).toBeLessThanOrEqual(innerWidth + 1);
}

async function registerAndLogin(page: Page, api: APIRequestContext) {
  const email = `e2e-resp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const password = 'StrongPassw0rd!';
  const res = await api.post(`${API}/auth/register`, { data: { organizationName: 'Responsive Pharmacy', ownerName: 'E2E Owner', email, password, stateCode: '27' } });
  expect(res.status(), await res.text()).toBe(201);
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test.describe('responsive layout', () => {
  test('public pages never scroll horizontally on phones and tablets', async ({ page }) => {
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      for (const path of PUBLIC_PAGES) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        await noHorizontalOverflow(page, `${path} @ ${vp.name}`);
        // Primary tap targets are large enough on phones.
        if (vp.width < 500 && path === '/') {
          const box = await page.getByRole('link', { name: /get started free/i }).first().boundingBox();
          expect(box?.height ?? 0, 'CTA height').toBeGreaterThanOrEqual(40);
        }
      }
    }
  });

  test('application screens never scroll horizontally on phones and tablets', async ({ page }) => {
    test.setTimeout(240_000); // 27 page loads on a dev server
    const api = await pwRequest.newContext();
    await page.setViewportSize({ width: 1280, height: 800 });
    await registerAndLogin(page, api);
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      for (const path of APP_PAGES) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        await noHorizontalOverflow(page, `${path} @ ${vp.name}`);
      }
    }
    // The mobile sidebar opens and closes.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/dashboard');
    await page.getByRole('button', { name: 'Open menu' }).click();
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
    await page.getByRole('button', { name: 'Close menu' }).click();
  });
});
