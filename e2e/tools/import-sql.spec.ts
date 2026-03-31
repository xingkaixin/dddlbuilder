import { test, expect } from '@playwright/test';

test.describe('SQL 导入功能验证 @tools', () => {
  test.beforeEach(async ({ context, page }) => {
    await context.addInitScript(() => {
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

  test('场景：导入建表 SQL 并回填 UI', async ({ page }) => {
    // 点击“导入 SQL”按钮 (在 Header 中)
    await page.getByRole('button', { name: /导入\s*SQL/i }).click();

    // 填写 SQL 到导入文本框
    const sqlInput = page.locator('#sql-content');
    await sqlInput.fill('CREATE TABLE import_test (id INT COMMENT "编号", name VARCHAR(50));');

    // 进入预览 -> 确认
    await page.getByRole('button', { name: /下一步/i }).click();
    await page.getByRole('button', { name: /下一步/i }).click();
    await page.getByRole('button', { name: /确认导入/i }).click();

    // 验证 UI 回填
    await expect(page.locator('#table-name')).toHaveValue('import_test');

    // 验证 HOT 中的字段
    const cell1 = page.locator('[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(2)');
    await expect(cell1).toHaveText('id');

    // 验证 SQL 生成面板同步更新
    const sqlOutput = page.locator('[data-state="active"] pre');
    await expect(sqlOutput).toContainText(/CREATE TABLE import_test/i);
    await expect(sqlOutput).toContainText(/id\s+INT/i);
  });
});
