import { test, expect, request as pwRequest } from '@playwright/test';

const WEB = process.env.E2E_WEB_URL ?? 'http://localhost:3000';
const PUBLIC_PAGES = ['/', '/features', '/ai-pharmacy-assistant', '/pricing', '/faq', '/demo', '/contact', '/about', '/privacy', '/terms', '/cookies', '/pharmacy-management-software', '/pharmacy-billing-software', '/pharmacy-pos', '/pharmacy-inventory-management', '/pharmacy-software-for-multiple-outlets'];

test.describe('public website: SEO, links, conversion', () => {
  test('every public page has one h1, a description, a canonical URL and Open Graph tags', async ({ page }) => {
    for (const path of PUBLIC_PAGES) {
      await page.goto(path);
      await expect(page.locator('h1'), path).toHaveCount(1);
      const description = await page.locator('meta[name="description"]').getAttribute('content');
      expect(description, `${path} description`).toBeTruthy();
      expect(description!.length, `${path} description length`).toBeLessThanOrEqual(175);
      const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
      expect(canonical, `${path} canonical`).toBe(`${WEB}${path === '/' ? '' : path}`.replace(/\/$/, '') || WEB);
      await expect(page.locator('meta[property="og:title"]'), path).toHaveCount(1);
      await expect(page.locator('meta[property="og:image"]').first(), path).toHaveAttribute('content', /opengraph-image/);
      const title = await page.title();
      expect(title.length, `${path} title "${title}"`).toBeLessThanOrEqual(70);
      expect(title, path).not.toMatch(/PharmaOS.*PharmaOS/);
    }
  });

  test('sitemap and robots are served and every sitemap URL responds', async () => {
    const api = await pwRequest.newContext();
    const robots = await api.get(`${WEB}/robots.txt`);
    expect(robots.status()).toBe(200);
    const robotsText = await robots.text();
    expect(robotsText).toContain('Sitemap:');
    expect(robotsText).toContain('Disallow: /dashboard');
    const sitemap = await api.get(`${WEB}/sitemap.xml`);
    expect(sitemap.status()).toBe(200);
    const xml = await sitemap.text();
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
    expect(urls.length).toBeGreaterThan(10);
    for (const url of urls) {
      // The dev server compiles each route on first hit; allow one retry for a slow first compile.
      let status = 0;
      for (let attempt = 0; attempt < 2 && status !== 200; attempt++) {
        try {
          status = (await api.get(url, { timeout: 60_000 })).status();
        } catch {
          status = 0;
        }
      }
      expect(status, url).toBe(200);
    }
    const og = await api.get(`${WEB}/opengraph-image`);
    expect(og.status()).toBe(200);
    expect(og.headers()['content-type']).toContain('image/png');
    const manifest = await api.get(`${WEB}/manifest.webmanifest`);
    expect(manifest.status()).toBe(200);
  });

  test('structured data is present on the home and FAQ pages', async ({ page }) => {
    await page.goto('/');
    const home = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(home.some((s) => s.includes('"SoftwareApplication"'))).toBe(true);
    expect(home.some((s) => s.includes('"Organization"') && s.includes('ChefoTech'))).toBe(true);
    await page.goto('/faq');
    const faq = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(faq.some((s) => s.includes('"FAQPage"'))).toBe(true);
  });

  test('header and footer links all resolve and the primary CTAs lead to real flows', async ({ page }) => {
    await page.goto('/');
    const hrefs = new Set<string>();
    for (const a of await page.locator('header a[href], footer a[href]').all()) {
      const href = await a.getAttribute('href');
      if (href && href.startsWith('/')) hrefs.add(href.split('#')[0]!);
    }
    expect(hrefs.has('/register')).toBe(true);
    expect(hrefs.has('/login')).toBe(true);
    expect(hrefs.has('/privacy')).toBe(true);
    const api = await pwRequest.newContext();
    for (const href of hrefs) {
      const res = await api.get(`${WEB}${href}`);
      expect(res.status(), href).toBe(200);
    }
    await page.getByRole('link', { name: /get started free/i }).first().click();
    await expect(page).toHaveURL(/\/register/);
    await expect(page.getByRole('heading', { name: /create your organization/i })).toBeVisible();
  });

  test('demo request form stores a lead and shows confirmation', async ({ page }) => {
    await page.goto('/demo');
    await page.getByRole('textbox', { name: 'Your name' }).fill('Playwright Pharmacy Owner');
    await page.getByRole('textbox', { name: 'Email' }).fill(`lead-${Date.now()}@example.com`);
    await page.getByRole('textbox', { name: 'Phone / WhatsApp' }).fill('+91 98765 43210');
    await page.getByRole('textbox', { name: 'Pharmacy name' }).fill('E2E Medicals');
    await page.getByRole('combobox', { name: 'Number of outlets' }).selectOption('2-3');
    await page.getByRole('textbox', { name: /anything specific/i }).fill('Batch and expiry, please.');
    await page.getByRole('button', { name: /request a demo/i }).click();
    // Consent was not ticked: an accessible error must appear and nothing is sent.
    await expect(page.getByText(/agree to be contacted/i)).toBeVisible();
    await page.getByLabel(/I agree that ChefoTech may contact me/i).check();
    await page.getByRole('button', { name: /request a demo/i }).click();
    await expect(page.getByRole('status')).toContainText(/demo request received/i);
  });

  test('mobile menu opens, lists solutions and closes on navigation', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Open menu' }).click();
    const menu = page.locator('#mobile-menu');
    await expect(menu).toBeVisible();
    await menu.getByRole('link', { name: 'Pharmacy POS' }).click();
    await expect(page).toHaveURL(/\/pharmacy-pos/);
    await expect(page.locator('#mobile-menu')).toHaveCount(0);
  });

  test('404 page is branded and links home', async ({ page }) => {
    const res = await page.goto('/this-page-does-not-exist');
    expect(res?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: /can.t find that page/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /go to the homepage/i })).toBeVisible();
  });
});
