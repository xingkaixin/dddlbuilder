import { test, expect } from '@playwright/test';
import { setupHydratedState } from '../utils';

test.describe('存储管理验证 @storage @smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await setupHydratedState(page);
  });

  test('场景：保存表并在列表中查看', async ({ page }) => {
    await page.locator('#table-name').fill('save_test_table');

    // 添加一个字段以确保可以保存（如果有校验的话）
    const cell = page.locator('[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(2)');
    await cell.dblclick();
    await page.locator('[data-testid="data-table"] input:not([aria-hidden="true"])').fill('id');
    await page.keyboard.press('Enter');

    // 点击保存按钮 (在 TableConfig 中)
    await page.getByRole('button', { name: /保存当前表/i }).click();
    await expect(page.getByRole('heading', { name: /保存当前表|更新保存的表/i })).toBeVisible();
    await page.getByLabel('保存名称').fill('save_test_table');
    await page.getByRole('button', { name: /^保存$/ }).click();
    await expect(page.getByRole('heading', { name: /保存当前表|更新保存的表/i })).toBeHidden();

    // 打开工作区抽屉
    await page.getByRole('button', { name: '工作区' }).click();
    await expect(page.getByRole('heading', { name: '工作区' })).toBeVisible();

    // 在侧边栏/对话框中应该能看到
    await expect(page.getByRole('button', { name: /save_test_table/i })).toBeVisible();
  });
});
