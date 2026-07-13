import { expect, test } from '@playwright/test';

const authenticatedRoutes = [
  '/',
  '/my-tasks',
  '/repairs',
  '/new',
  '/claim',
  '/claim-history',
  '/inventory',
  '/withdrawal',
  '/withdrawal-history',
  '/transactions',
  '/pending-returns',
  '/stock-counts',
  '/purchase-orders',
  '/technician-stock',
  '/technician-stock/movements',
  '/technicians',
  '/reports',
  '/stations',
  '/settings',
  '/users',
  '/users/audit-logs',
];

const evidenceRoutes = new Set(['/', '/withdrawal', '/purchase-orders', '/stations', '/settings']);

async function expectNoPageOverflow(page, route) {
  const overflow = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));

  expect.soft(
    Math.max(overflow.document, overflow.body),
    `${route} must not create page-level horizontal overflow`,
  ).toBeLessThanOrEqual(overflow.viewport + 1);
}

test.describe('public responsive release gate', () => {
  test('login remains usable without page overflow or disabled zoom', async ({ page }, testInfo) => {
    const consoleErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });

    await page.goto('/login');
    await expect(page.locator('.login-card-container')).toBeVisible();
    await expect(page.locator('input')).toHaveCount(2);
    await expect(page.locator('form button[type="submit"]')).toBeVisible();

    const viewportMeta = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(viewportMeta).not.toContain('user-scalable=no');
    expect(viewportMeta).not.toContain('maximum-scale=1');

    await expectNoPageOverflow(page, '/login');

    const cardBox = await page.locator('.login-card-container').boundingBox();
    expect(cardBox).not.toBeNull();
    expect(cardBox.x).toBeGreaterThanOrEqual(0);
    expect(cardBox.x + cardBox.width).toBeLessThanOrEqual(testInfo.project.use.viewport.width + 1);

    await page.screenshot({
      path: testInfo.outputPath('login.png'),
      fullPage: true,
      animations: 'disabled',
    });
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('authenticated route sweep', () => {
  const username = process.env.RESPONSIVE_USERNAME;
  const password = process.env.RESPONSIVE_PASSWORD;

  test.skip(!username || !password, 'Set RESPONSIVE_USERNAME and RESPONSIVE_PASSWORD for the staging route sweep.');

  test('all protected routes stay within the viewport', async ({ page }, testInfo) => {
    const runtimeErrors = [];
    page.on('pageerror', (error) => runtimeErrors.push(error.message));

    await page.goto('/login');
    await page.locator('input').nth(0).fill(username);
    await page.locator('input').nth(1).fill(password);
    await page.locator('form button[type="submit"]').click();
    await expect(page).not.toHaveURL(/\/login$/);

    for (const route of authenticatedRoutes) {
      await page.goto(route);
      await page.waitForLoadState('domcontentloaded');
      await expect(page).not.toHaveURL(/\/login$/);
      await expectNoPageOverflow(page, route);

      if (evidenceRoutes.has(route)) {
        const slug = route === '/' ? 'dashboard' : route.slice(1).replaceAll('/', '-');
        await page.screenshot({
          path: testInfo.outputPath(`${slug}.png`),
          fullPage: true,
          animations: 'disabled',
        });
      }
    }

    expect(runtimeErrors).toEqual([]);
  });
});
