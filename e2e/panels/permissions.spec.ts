import { test, expect } from '@playwright/test';
import { ensureBuilderVisible } from '../utils';

test.describe('权限管理验证 @panels', () => {
  test.beforeEach(async ({ page }) => {
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
});
