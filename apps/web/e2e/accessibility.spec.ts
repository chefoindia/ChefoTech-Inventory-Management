import { test, expect, request as pwRequest, type APIRequestContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Automated WCAG 2.1 AA scan (axe-core) of the screens staff use all day. Serious and critical
 * violations fail the test; the full list is printed so moderate ones can be triaged.
 */
const API = process.env.E2E_API_URL ?? 'http://localhost:4000/api/v1';

async function registerAndLogin(page: Page, api: APIRequestContext) {
  const email = `a11y-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const password = 'StrongPassw0rd!';
  const res = await api.post(`${API}/auth/register`, { data: { organizationName: 'A11y Pharmacy', ownerName: 'A11y Owner', email, password, stateCode: '27' } });
  expect(res.status()).toBe(201);
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

const PAGES = ['/dashboard', '/sales/pos', '/products', '/inventory', '/customers', '/purchases/new', '/settings/organization', '/settings/notifications', '/settings/ai'];
const PUBLIC = ['/', '/features', '/pricing', '/faq', '/contact', '/demo', '/ai-pharmacy-assistant', '/pharmacy-billing-software', '/about', '/privacy'];

test.describe('accessibility (axe-core, WCAG 2.1 AA)', () => {
  test('key screens have no serious or critical violations', async ({ page }) => {
    const api = await pwRequest.newContext();
    await registerAndLogin(page, api);
    const failures: string[] = [];
    for (const path of PAGES) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      for (const v of results.violations) {
        const line = `${path}: [${v.impact}] ${v.id} — ${v.help} (${v.nodes.length} node${v.nodes.length === 1 ? '' : 's'}; e.g. ${v.nodes[0]?.target.join(' ')})`;
        // eslint-disable-next-line no-console
        console.log(line);
        if (v.impact === 'serious' || v.impact === 'critical') failures.push(line);
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  test('public website pages have no serious or critical violations', async ({ page }) => {
    const failures: string[] = [];
    for (const path of PUBLIC) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      for (const v of results.violations) {
        const line = `${path}: [${v.impact}] ${v.id} — ${v.help} (${v.nodes.length} node${v.nodes.length === 1 ? '' : 's'}; e.g. ${v.nodes[0]?.target.join(' ')})`;
        // eslint-disable-next-line no-console
        console.log(line);
        if (v.impact === 'serious' || v.impact === 'critical') failures.push(line);
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  test('login page is accessible without a session', async ({ page }) => {
    await page.goto('/login');
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});
