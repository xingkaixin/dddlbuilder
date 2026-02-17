import { test, expect } from '@playwright/test';

test.describe('字段行操作验证 @fields', () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      window.localStorage.setItem(
        'ddlbuilder:fireworks:cny:shown:2026:v1',
        'true',
      );
    });
  });

  test('场景：添加多行字段并验证 SQL', async ({ context, page }) => {
    await context.addInitScript(() => {
      const rows = Array.from({ length: 6 }, (_, i) => ({
        order: i + 1,
        fieldName: `field_${i + 1}`,
        fieldType: 'INT',
      }));
      window.localStorage.setItem(
        'ddlbuilder:state:v1',
        JSON.stringify({
          tableName: 'multi_fields',
          rows,
        }),
      );
    });
    await page.goto('/');
    await expect(page.locator('#table-name')).toHaveValue('multi_fields', {
      timeout: 10000,
    });

    const sqlOutput = page.locator('[data-state="active"] pre');

    // 填写第一行并确保 SQL 更新
    const cell1 = page.locator(
      '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(2)',
    );
    await cell1.dblclick();
    await page.locator('[data-testid="data-table"] input').fill('f1');
    await page.keyboard.press('Enter');
    await expect(sqlOutput).toContainText(/f1/i, { timeout: 10000 });

    // 填写第二行并确保 SQL 更新
    const cell2 = page.locator(
      '[data-testid="data-table"] tbody tr:nth-child(2) td:nth-child(2)',
    );
    await cell2.dblclick();
    await page.locator('[data-testid="data-table"] input').fill('f2');
    await page.keyboard.press('Enter');
    await expect(sqlOutput).toContainText(/f2/i, { timeout: 10000 });
  });

  test('场景：清空所有字段', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#table-name')).toBeVisible({ timeout: 10000 });
    await page.locator('#table-name').fill('clear_test');

    const cell = page.locator(
      '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(2)',
    );
    await cell.dblclick();
    await page
      .locator('[data-testid="data-table"] input')
      .fill('to_be_cleared');
    await page.keyboard.press('Enter');
    await expect(cell).toHaveText('to_be_cleared', { timeout: 5000 });

    const typeCell = page.locator(
      '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(4)',
    );
    await typeCell.dblclick();
    await page.locator('[data-testid="data-table"] input').fill('int');
    await page.keyboard.press('Enter');
    await expect(typeCell).toHaveText(/int/i);

    const sqlOutput = page.locator('[data-state="active"] pre');
    await expect(sqlOutput).toContainText(/to_be_cleared/i, { timeout: 10000 });

    // 点击“清空所有”
    await page.getByRole('button', { name: /清空所有/i }).click();
    // 确认对话框
    await page.getByRole('button', { name: /确认清空/i }).click();

    // 验证 SQL 回到占位符状态 (表名也被清空了，所以提示请填写表名)
    await expect(sqlOutput).toContainText(/请填写表名/i, { timeout: 10000 });
  });
});
