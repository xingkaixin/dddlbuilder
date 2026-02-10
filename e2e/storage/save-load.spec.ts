import { test, expect } from '@playwright/test';

test.describe('存储管理验证 @storage @smoke', () => {
  test.beforeEach(async ({ context, page }) => {
    await context.addInitScript(() => {
      window.localStorage.setItem('fireworks_shown_2026', 'true');
      window.localStorage.setItem(
        'ddlbuilder:state:v1',
        JSON.stringify({
          tableName: 'HYDRATION_CHECK',
          rows: [{ order: 1, fieldName: 'HYDRATED_FIELD', fieldType: 'INT' }],
        }),
      );
    });
    await page.goto('/');
    await expect(page.locator('#table-name')).toHaveValue('HYDRATION_CHECK', {
      timeout: 10000,
    });
  });

  test('场景：保存表并在列表中查看', async ({ page }) => {
    await page.locator('#table-name').fill('save_test_table');

    // 添加一个字段以确保可以保存（如果有校验的话）
    const cell = page.locator(
      '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(2)',
    );
    await cell.dblclick();
    await page.locator('[data-testid="data-table"] input').fill('id');
    await page.keyboard.press('Enter');

    // 点击保存按钮 (在 TableConfig 中)
    await page.locator('button[title="保存表"]').click();
    await expect(page.getByText(/保存当前表|更新保存的表/i)).toBeVisible();
    await page.getByLabel('保存名称').fill('save_test_table');
    await page.getByRole('button', { name: /^保存$/ }).click();
    await expect(page.getByText(/保存当前表|更新保存的表/i)).toBeHidden();

    // 点击“查看已保存表”
    await page.getByRole('button', { name: /查看已保存表/i }).click();
    await expect(page.getByText('已保存的表')).toBeVisible();

    // 在侧边栏/对话框中应该能看到
    await expect(
      page.getByRole('button', { name: /save_test_table/i }),
    ).toBeVisible();
  });
});
