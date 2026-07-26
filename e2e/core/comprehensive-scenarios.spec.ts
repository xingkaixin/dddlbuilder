import { test, expect } from '@playwright/test';
import { setupHydratedState } from '../utils';

test.describe('综合场景测试 @core @smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await setupHydratedState(page);
  });

  test('场景：完整的建表流程 - 从空白到生成完整的 DDL', async ({ page }) => {
    // 1. 选择数据库类型
    await page.locator('[data-testid="db-type-selector"]').click();
    await page.getByRole('option', { name: 'MySQL', exact: true }).click();

    // 2. 填写表基本信息
    const tableNameInput = page.locator('#table-name');
    const tableCommentInput = page.locator('#table-comment');

    await tableNameInput.fill('user_order');
    await tableCommentInput.fill('用户订单表');

    await expect(tableNameInput).toHaveValue('user_order');
    await expect(tableCommentInput).toHaveValue('用户订单表');

    // 3. 修改已有字段
    const firstFieldNameCell = page.locator(
      '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(2)',
    );
    await firstFieldNameCell.dblclick();
    await page.locator('[data-testid="data-table"] input:not([aria-hidden="true"])').fill('id');
    await page.keyboard.press('Enter');

    const firstFieldTypeCell = page.locator(
      '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(4)',
    );
    await firstFieldTypeCell.dblclick();
    await page.locator('[data-testid="data-table"] input:not([aria-hidden="true"])').fill('bigint');
    await page.keyboard.press('Enter');

    // 4. 验证 SQL 已生成
    const sqlOutput = page.locator('[role="tabpanel"]:visible pre');
    await expect(sqlOutput).toContainText(/CREATE TABLE\s+`?user_order`?/i, {
      timeout: 10000,
    });
    await expect(sqlOutput).toContainText(/id\s+BIGINT/i);
    await expect(sqlOutput).toContainText(/COMMENT\s*=\s*'用户订单表'/i);
  });

  test('场景：在不同数据库类型间切换时应保留字段配置', async ({ page }) => {
    // 填写表名和修改字段
    await page.locator('#table-name').fill('cross_db_test');

    const firstFieldNameCell = page.locator(
      '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(2)',
    );
    await firstFieldNameCell.dblclick();
    await page
      .locator('[data-testid="data-table"] input:not([aria-hidden="true"])')
      .fill('test_field');
    await page.keyboard.press('Enter');

    // 验证字段存在
    await expect(firstFieldNameCell).toHaveText('test_field');

    // 切换到 PostgreSQL
    await page.locator('[data-testid="db-type-selector"]').click();
    await page.getByRole('option', { name: 'PostgreSQL', exact: true }).click();

    // 验证字段配置保留
    await expect(page.locator('#table-name')).toHaveValue('cross_db_test');
    await expect(firstFieldNameCell).toHaveText('test_field');
  });
});
