import { test, expect, request as pwRequest, type APIRequestContext, type Page } from '@playwright/test';

const API = process.env.E2E_API_URL ?? 'http://localhost:4000/api/v1';

async function registerAndLogin(page: Page, api: APIRequestContext) {
  const email = `e2e-ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const password = 'StrongPassw0rd!';
  const res = await api.post(`${API}/auth/register`, { data: { organizationName: 'E2E AI Pharmacy', ownerName: 'E2E Owner', email, password, stateCode: '27' } });
  expect(res.status(), await res.text()).toBe(201);
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test.describe('Gemini AI (optional per organization)', () => {
  test('disconnected by default: dashboard points to settings, no assistant button, invalid key is rejected', async ({ page }) => {
    const api = await pwRequest.newContext();
    await registerAndLogin(page, api);

    // Dashboard card explains how to enable AI and nothing AI-related is active yet.
    await expect(page.getByText('AI features are not connected')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ask AI' })).toHaveCount(0);

    await page.getByRole('link', { name: 'Settings → AI' }).click();
    await expect(page).toHaveURL(/\/settings\/ai/);
    await expect(page.getByText('Not connected', { exact: true })).toBeVisible();

    // An invalid key is validated against Gemini before it is stored; it must not be saved.
    const keyInput = page.getByPlaceholder('AIza…');
    await keyInput.fill('AIza-this-is-not-a-real-key-000000000');
    await page.getByRole('button', { name: 'Save & connect' }).click();
    await expect(page.getByRole('status').or(page.locator('[data-sonner-toast]')).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Not connected', { exact: true })).toBeVisible();
    await expect(page.getByText(/Gemini AI connected/)).toHaveCount(0);
  });
});
