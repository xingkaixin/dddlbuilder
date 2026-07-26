import { test, expect } from '@playwright/test';
import { setupHydratedState } from '../utils';

test.describe('SQL 导入功能验证 @tools', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/parse-sql', async (route) => {
      await route.fulfill({
        json: {
          result: {
            tableName: 'import_test',
            tableComment: '',
            fields: [
              {
                name: 'id',
                type: 'int',
                comment: '编号',
                nullable: true,
                defaultKind: 'none',
                defaultValue: '',
                onUpdate: 'none',
              },
              {
                name: 'name',
                type: 'varchar(50)',
                comment: '',
                nullable: true,
                defaultKind: 'none',
                defaultValue: '',
                onUpdate: 'none',
              },
            ],
            indexes: [],
            foreignKeys: [],
            authObjects: [],
          },
        },
      });
    });
    await page.goto('/');
    await setupHydratedState(page);
  });

  test('场景：导入建表 SQL 并回填 UI', async ({ page }) => {
    await page.getByRole('button', { name: /导入结构/i }).click();

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
    const sqlOutput = page.locator('[role="tabpanel"]:visible pre');
    await expect(sqlOutput).toContainText(/CREATE TABLE import_test/i);
    await expect(sqlOutput).toContainText(/id\s+INT/i);
  });
});
