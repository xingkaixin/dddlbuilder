import { test, expect } from '@playwright/test';
import { confirmFieldTypeChangeIfNeeded, setupHydratedState } from '../utils';

test.describe('SQL 自动生成流程 @core @smoke', () => {
  test('场景：填写表信息和字段后，应正确生成建表 SQL', async ({ page }) => {
    // 1. 访问首页
    await page.goto('/');
    await setupHydratedState(page);
    await expect(page).toHaveTitle(/筑表师/);

    // 2. 填写表信息
    const tableNameInput = page.locator('#table-name');
    const tableCommentInput = page.locator('#table-comment');

    await tableNameInput.fill('user_profile');
    await tableCommentInput.fill('用户详情表');

    // 3. 填写字段信息
    // 点击第一行字段名单元格开始输入
    const firstFieldNameCell = page.locator(
      '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(2)',
    );
    await firstFieldNameCell.dblclick();
    await page.locator('[data-testid="data-table"] input:not([aria-hidden="true"])').fill('id');
    await page.keyboard.press('Enter');

    // 填写字段注释 (第三列)
    const firstFieldCommentCell = page.locator(
      '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(3)',
    );
    await firstFieldCommentCell.dblclick();
    await page
      .locator('[data-testid="data-table"] input:not([aria-hidden="true"])')
      .fill('用户编号');
    await page.keyboard.press('Enter');

    // 填写字段类型 (第四列)
    const firstFieldTypeCell = page.locator(
      '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(4)',
    );
    await firstFieldTypeCell.dblclick();
    await page
      .locator('[data-testid="data-table"] input:not([aria-hidden="true"])')
      .fill('varchar(255)');
    await page.keyboard.press('Enter');
    await confirmFieldTypeChangeIfNeeded(page);

    // 验证 UI 上的值是否已填入
    await expect(firstFieldNameCell).toHaveText('id');
    await expect(firstFieldCommentCell).toHaveText('用户编号');
    await expect(firstFieldTypeCell).toHaveText('varchar(255)');

    // 4. 验证生成的 SQL
    const sqlOutput = page.locator('[role="tabpanel"]:visible pre');

    // 等待状态同步
    await expect(sqlOutput).toContainText(/CREATE TABLE\s+`?user_profile`?/i, {
      timeout: 10000,
    });
    await expect(sqlOutput).toContainText(/COMMENT\s*=?\s*'用户详情表'/i);
    await expect(sqlOutput).toContainText(/`?id`?\s+VARCHAR\(255\)/i);
    await expect(sqlOutput).toContainText(/COMMENT\s+'用户编号'/i);

    // 5. 点击第五列的 checkbox 取消可空 (NOT NULL)
    const firstNullableCheckbox = page.locator(
      '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(5) [data-slot="checkbox"]',
    );
    await firstNullableCheckbox.click();
    await expect(sqlOutput).toContainText(/NOT NULL/i, { timeout: 5000 });
  });
});
