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

const evidenceRoutes = new Set(['/', '/withdrawal', '/purchase-orders', '/stations', '/settings', '/users/audit-logs']);

async function expectPriorityControlsInsideViewport(page, route) {
  const clipped = await page.locator('.page-header button, .mobile-data-card button, .audit-mobile-card button').evaluateAll((controls) => {
    const viewportWidth = document.documentElement.clientWidth;
    return controls.flatMap((control) => {
      const style = getComputedStyle(control);
      const rect = control.getBoundingClientRect();
      if (style.visibility === 'hidden' || style.display === 'none' || rect.width === 0 || rect.height === 0) return [];
      if (rect.left >= -1 && rect.right <= viewportWidth + 1) return [];
      return [{ label: control.getAttribute('aria-label') || control.textContent?.trim() || control.tagName, left: rect.left, right: rect.right }];
    });
  });

  expect.soft(clipped, `${route} priority controls must not be clipped by the viewport`).toEqual([]);
}

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

async function expectTableIntegrity(page, route) {
  const tableCount = await page.locator('.data-table').count();

  for (let index = 0; index < tableCount; index += 1) {
    const table = page.locator('.data-table').nth(index);
    const container = table.locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " data-table-container ")]').first();
    const actionCell = table.locator('.sticky-actions-col-td').first();
    if (await actionCell.count() === 0 || await container.count() === 0) continue;

    const metrics = await actionCell.evaluate((cell) => {
      const group = cell.querySelector('.table-action-group');
      const cellRect = cell.getBoundingClientRect();
      const groupRect = group?.getBoundingClientRect();
      const container = cell.closest('.data-table-container');
      const containerRect = container?.getBoundingClientRect();
      const style = getComputedStyle(cell);
      const groupStyle = group ? getComputedStyle(group) : null;
      const buttonRects = group
        ? Array.from(group.querySelectorAll('button')).map((button) => button.getBoundingClientRect())
        : [];
      return {
        cellRight: cellRect.right,
        groupRight: groupRect?.right ?? null,
        lastButtonRight: buttonRects.at(-1)?.right ?? null,
        containerRight: containerRect?.right ?? null,
        boxShadow: style.boxShadow,
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        groupWidth: groupStyle?.width ?? null,
        groupJustify: groupStyle?.justifyContent ?? null,
      };
    });

    expect.soft(metrics.cellRight, `${route} action cell must stay inside its table`).toBeLessThanOrEqual((metrics.containerRight ?? metrics.cellRight) + 1);
    if (metrics.groupRight !== null) {
      expect.soft(metrics.groupRight, `${route} action group needs a safe right inset`).toBeLessThanOrEqual(metrics.cellRight - 15);
    }
    if (metrics.lastButtonRight !== null) {
      expect.soft(metrics.lastButtonRight, `${route} action buttons must fit inside the cell`).toBeLessThanOrEqual(metrics.cellRight - 15);
    }
    expect.soft(metrics.boxShadow, `${route} action cell must not render a shadow`).toBe('none');
    expect.soft(metrics.backgroundColor, `${route} action cell must not use a plain white surface`).not.toBe('rgb(255, 255, 255)');
    expect.soft(metrics.backgroundImage, `${route} action cell must not repaint the application gradient`).toBe('none');
    expect.soft(metrics.groupWidth, `${route} action group must fill its cell`).toBe('100%');
    expect.soft(metrics.groupJustify, `${route} action group must be centered`).toBe('center');
  }

  const contentMetrics = await page.locator('.data-table__cell-content').evaluateAll((contents) => contents.map((content) => {
    const overflowing = content.scrollWidth > content.clientWidth + 1 || content.scrollHeight > content.clientHeight + 1;
    const style = getComputedStyle(content);
    return {
      overflowing,
      tooltip: content.getAttribute('data-tooltip'),
      tabIndex: content.tabIndex,
      mode: Array.from(content.classList).find((name) => name.startsWith('data-table__cell-content--')),
      whiteSpace: style.whiteSpace,
      lineClamp: style.webkitLineClamp,
    };
  }));

  for (const [index, metric] of contentMetrics.entries()) {
    if (metric.overflowing) {
      expect.soft(metric.tooltip, `${route} clipped cell ${index + 1} must expose its full value`).toBeTruthy();
      expect.soft(metric.tabIndex, `${route} clipped cell ${index + 1} must be keyboard focusable`).toBe(0);
    }
    if (metric.mode === 'data-table__cell-content--wrap-2') {
      expect.soft(metric.whiteSpace, `${route} wrapped cell ${index + 1} must allow line wrapping`).toBe('normal');
      expect.soft(metric.lineClamp, `${route} wrapped cell ${index + 1} must stop at two lines`).toBe('2');
    }
  }
}

async function loginWithConfiguredUser(page, username, password) {
  await page.goto('/login');
  await page.locator('input').nth(0).fill(username);
  await page.locator('input').nth(1).fill(password);
  await page.locator('form button[type="submit"]').click();
  await expect(page).not.toHaveURL(/\/login$/);
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
    const consoleErrors = [];
    page.on('pageerror', (error) => runtimeErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });

    await loginWithConfiguredUser(page, username, password);

    for (const route of authenticatedRoutes) {
      await page.goto(route);
      await page.waitForLoadState('domcontentloaded');
      await expect(page).not.toHaveURL(/\/login$/);
      if (route === '/') {
        await expect(page.getByRole('heading', { name: 'ภาพรวมคลังที่ช่วยให้จัดการได้เร็วขึ้น' })).toBeVisible();
        await expect(page.getByText('เกิดข้อผิดพลาดในการโหลดส่วนนี้')).toHaveCount(0);
      }
      await expectNoPageOverflow(page, route);
      await expectPriorityControlsInsideViewport(page, route);
      await expectTableIntegrity(page, route);

      if (route === '/users/audit-logs') {
        const unnamedPaginationButtons = await page.locator('.audit-logs-surface button').evaluateAll((buttons) => buttons.filter((button) => {
          const hasText = Boolean(button.textContent?.trim());
          return !hasText && !button.getAttribute('aria-label') && !button.getAttribute('title');
        }).length);
        expect.soft(unnamedPaginationButtons, 'Audit pagination icon buttons must have accessible names').toBe(0);
      }

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
    expect(consoleErrors).toEqual([]);
  });
});
