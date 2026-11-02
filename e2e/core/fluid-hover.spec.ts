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
  await page.getByRole('button', { name: '帮助', exact: true }).click();
  const docs = page.getByRole('menuitem', { name: /文档/ });
  const feedback = page.getByRole('menuitem', { name: /反馈/ });
  const group = page.locator('[data-fluid-hover]').filter({ has: docs });
  const highlight = group.locator(':scope > [data-slot="fluid-hover-highlight"]');
  await docs.hover();
  await expectAligned(highlight, docs);
  await feedback.hover();
  await expectAligned(highlight, feedback);
  await page.screenshot({ path: testInfo.outputPath('menu-hover.png') });
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
