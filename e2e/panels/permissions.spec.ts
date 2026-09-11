import { test, expect } from '@playwright/test';
import { ensureBuilderVisible } from '../utils';

test.describe('权限管理验证 @panels', () => {
  test.beforeEach(async ({ context, page }) => {
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: async () => {} },
        configurable: true,
      });
    });
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/');
    await ensureBuilderVisible(page);
    await page.locator('#table-name').fill('perm_test');

    // 添加一个字段
    const cell = page.locator('[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(2)');
    await cell.dblclick();
    await page.locator('[data-testid="data-table"] input:not([aria-hidden="true"])').fill('id');
    await page.keyboard.press('Enter');
  });

  test('场景：为用户授予权限并验证 DCL', async ({ page }) => {
    // 切换到“授权配置”面板
    await page.getByRole('tab', { name: /授权配置/i }).click();

    // 输入授权对象
    const authInput = page.getByPlaceholder(/输入授权对象名称/i);
    await authInput.fill('admin_role');
    await page.keyboard.press('Enter');

    await page.getByRole('tab', { name: /授权 DCL/i }).click();
    const dclOutput = page.getByRole('tabpanel', { name: /授权 DCL/i }).locator('pre');
    await expect(dclOutput).toContainText(/GRANT SELECT ON perm_test TO admin_role/i);
  });

  test('场景：复制 DCL', async ({ page }) => {
    await page.getByRole('tab', { name: /授权配置/i }).click();
    const authInput = page.getByPlaceholder(/输入授权对象名称/i);
    await authInput.fill('copy_role');
    await page.keyboard.press('Enter');

    await page.getByRole('tab', { name: /授权 DCL/i }).click();
    await page.evaluate(() => {
      // SAFETY: This browser test installs a mutable clipboard probe on the page global.
      (window as any).__copyTriggered = false;

      const writeText = async () => {
        // SAFETY: This browser test reads the boolean flag installed on the same page global above.
        (window as any).__copyTriggered = true;
      };

      try {
        Object.defineProperty(navigator, 'clipboard', {
          value: { writeText },
          configurable: true,
        });
      } catch {
        // SAFETY: The fallback replaces the same test-only clipboard probe when the property is not configurable.
        (navigator as any).clipboard = { writeText };
      }
    });
    const copyButton = page.getByRole('button', { name: /复制DCL/i });
    await copyButton.click();
    // SAFETY: This browser test reads the boolean flag installed on the same page global above.
    await expect.poll(() => page.evaluate(() => (window as any).__copyTriggered)).toBe(true);
  });
});
