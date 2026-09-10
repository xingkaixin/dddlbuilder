import { test, expect, type Locator } from '@playwright/test';
import { ensureBuilderVisible } from '../utils';

async function expectAligned(highlight: Locator, item: Locator) {
  await expect
    .poll(async () => {
      const a = await highlight.boundingBox();
      const b = await item.boundingBox();

      if (!a || !b) return Infinity;

      return Math.max(
        Math.abs(a.x - b.x),
        Math.abs(a.y - b.y),
        Math.abs(a.width - b.width),
        Math.abs(a.height - b.height),
      );
    })
    .toBeLessThan(1.5);
  await expect(highlight).toHaveCSS('opacity', '1');
}

test('fluid tabs glide without selecting and yield to keyboard focus', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await ensureBuilderVisible(page);
  const fields = page.getByRole('tab', { name: '字段配置', exact: true });
  const indexes = page.getByRole('tab', { name: '索引配置', exact: true });
  const list = page.getByRole('tablist').filter({ has: fields });
  const highlight = list.locator('[data-slot="fluid-hover-highlight"]');
  await fields.hover();
  await expectAligned(highlight, fields);
  await indexes.hover();
  await expectAligned(highlight, indexes);
  await expect(highlight).toHaveCSS('transition-duration', '0.14s, 0.14s, 0.14s, 0.08s');
  await expect(fields).toHaveAttribute('aria-selected', 'true');
  await expect(indexes).toHaveAttribute('aria-selected', 'false');
  await page.screenshot({ path: testInfo.outputPath('tabs-hover.png') });
  await fields.focus();
  await page.keyboard.press('ArrowRight');
  await expect(indexes).toBeFocused();
  await expect(highlight).toHaveCSS('opacity', '0');
  await page.keyboard.press('Enter');
  await expect(indexes).toHaveAttribute('aria-selected', 'true');

  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await fields.hover();
  await expectAligned(highlight, fields);
  await expect(highlight).toHaveCSS('transition-property', 'opacity');
  await page.screenshot({ path: testInfo.outputPath('tabs-hover-dark-reduced-motion.png') });
  await page.mouse.move(0, 0);
  await expect(highlight).toHaveCSS('opacity', '0');
});

test('menu hover stays inside its group and retains native activation', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: '功能菜单', exact: true }).click();
  const docs = page.getByRole('menuitem', { name: /文档/ });
  const feedback = page.getByRole('menuitem', { name: /反馈/ });
  const group = page.locator('[data-fluid-hover]').filter({ has: docs });
  const highlight = group.locator(':scope > [data-slot="fluid-hover-highlight"]');
  await docs.hover();
  await expectAligned(highlight, docs);
  await feedback.hover();
  await expectAligned(highlight, feedback);
  await page.screenshot({ path: testInfo.outputPath('menu-hover.png') });
  const language = page.getByRole('menuitem', { name: /语言/ });
  await language.click();
  await expect(highlight).toHaveCSS('opacity', '0');
  const english = page.getByRole('menuitemradio', { name: 'English', exact: true });
  await english.hover();
  await expectAligned(
    page
      .locator('[data-fluid-hover]')
      .filter({ has: english })
      .locator('[data-slot="fluid-hover-highlight"]'),
    english,
  );
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await english.click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
});

test('settings navigation preserves gap clicks and vertical keyboard navigation', async ({
  page,
}, testInfo) => {
  await page.route('**/api/me', (route) =>
    route.fulfill({
      json: {
        signedIn: true,
        user: {
          userId: 'hover-test',
          name: 'Hover Test',
          email: 'hover@example.com',
          emailVerified: true,
        },
      },
    }),
  );
  await page.route('**/api/workspaces', (route) =>
    route.fulfill({ json: { workspaceId: 'hover-workspace' } }),
  );
  await page.route('**/api/workspaces/hover-workspace/yjs', (route) =>
    route.fulfill({ status: 204 }),
  );
  await page.routeWebSocket('**/api/workspaces/hover-workspace/yjs', (socket) => socket.close());
  await page.route('**/api/credits/ledger?*', (route) =>
    route.fulfill({ json: { items: [], total: 0, limit: 20, offset: 0 } }),
  );
  await page.route('**/api/credits/balance', (route) =>
    route.fulfill({ json: { balance: 100, version: 1, userId: 'hover-test' } }),
  );
  await page.goto('/');
  await page.getByTitle('Hover Test', { exact: true }).click();
  await page.getByRole('menuitem', { name: '设置', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const tabs = dialog.getByRole('tab');
  const first = tabs.nth(0);
  const second = tabs.nth(1);
  const list = dialog.getByRole('tablist');
  const highlight = list.locator('[data-slot="fluid-hover-highlight"]');
  await second.hover();
  await expectAligned(highlight, second);
  await expect(first).toHaveAttribute('aria-selected', 'true');
  await page.screenshot({ path: testInfo.outputPath('settings-hover.png') });
  const a = await first.boundingBox();
  const b = await second.boundingBox();

  if (!a || !b) throw new Error('Settings tabs must have layout boxes');
  await page.mouse.click(b.x + b.width / 2, b.y - 1);
  await expect(first).toHaveAttribute('aria-selected', 'true');

  const listBox = await list.boundingBox();

  if (!listBox) throw new Error('Settings navigation must be visible');
  await page.mouse.move(listBox.x + listBox.width / 2, listBox.y + listBox.height - 10);
  await expect(highlight).toHaveCSS('opacity', '0');
  await first.focus();
  await page.keyboard.press('ArrowDown');
  await expect(second).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(second).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await page.getByTitle('Hover Test', { exact: true }).click();
  await page.getByRole('menuitem', { name: '设置', exact: true }).click();
  await second.hover();
  await expectAligned(highlight, second);
});

test.describe('touch input', () => {
  test.use({ hasTouch: true });
  test('tab taps select without leaving a hover background', async ({ page }) => {
    await page.goto('/');
    await ensureBuilderVisible(page);
    const indexes = page.getByRole('tab', { name: '索引配置', exact: true });
    await indexes.tap();
    await expect(indexes).toHaveAttribute('aria-selected', 'true');
    await expect(
      page
        .getByRole('tablist')
        .filter({ has: indexes })
        .locator('[data-slot="fluid-hover-highlight"]'),
    ).toHaveCSS('opacity', '0');
  });
});
