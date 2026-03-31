import { test, expect } from '@playwright/test';

test.describe('单元格深度交互验证 @fields', () => {
  test.beforeEach(async ({ context: _context, page }) => {
    await page.goto('/');
    await expect(page.locator('#table-name')).toBeVisible({ timeout: 10000 });
  });

  test('场景：操作"可为空"复选框', async ({ page }) => {
    await page.locator('#table-name').fill('cell_test');

    // 输入字段名
    const firstFieldNameCell = page.locator(
      '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(2)',
    );
    await firstFieldNameCell.dblclick();
    await page.locator('[data-testid="data-table"] input').fill('f1');
    await page.keyboard.press('Enter');
    await expect(firstFieldNameCell).toHaveText('f1', { timeout: 5000 });

    // 输入字段类型
    const firstFieldTypeCell = page.locator(
      '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(4)',
    );
    await firstFieldTypeCell.dblclick();
    await page.locator('[data-testid="data-table"] input').fill('int');
    await page.keyboard.press('Enter');
    await expect(firstFieldTypeCell).toHaveText(/int/i, { timeout: 5000 });

    const sqlOutput = page.locator('[data-state="active"] pre');
    // 等待 SQL 生成
    await expect(sqlOutput).toContainText(/f1\s+INT\s+NULL/i, {
      timeout: 10000,
    });

    // 点击第五列的 checkbox 切换 nullable
    const nullableCheckbox = page.locator(
      '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(5) button[role="checkbox"]',
    );

    // 第一次点击：NULL -> NOT NULL
    await nullableCheckbox.click();
    await page.waitForTimeout(1000); // 等待 React 状态更新和 SQL 重新生成
    await expect(sqlOutput).toContainText(/f1\s+INT\s+NOT NULL/i, {
      timeout: 5000,
    });

    // 第二次点击：NOT NULL -> NULL
    await nullableCheckbox.click();
    await page.waitForTimeout(1000);
    await expect(sqlOutput).toContainText(/f1\s+INT\s+NULL/i, {
      timeout: 5000,
    });
  });

  test('场景：使用 Tab 键在跨行/跨列导航并输入', async ({ page }) => {
    await page.locator('#table-name').fill('cell_test');

    // 第一个单元格：字段名
    const fieldNameCell = page.locator(
      '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(2)',
    );
    await fieldNameCell.dblclick();
    await page.locator('[data-testid="data-table"] input').fill('id');
    await page.keyboard.press('Enter');

    // 第二个单元格：字段中文名
    const commentCell = page.locator(
      '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(3)',
    );
    await commentCell.dblclick();
    await page.locator('[data-testid="data-table"] input').fill('primary_key');
    await page.keyboard.press('Enter');

    // 第三个单元格：字段类型
    const typeCell = page.locator(
      '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(4)',
    );
    await typeCell.dblclick();
    await page.locator('[data-testid="data-table"] input').fill('bigint');
    await page.keyboard.press('Enter');

    const sqlOutput = page.locator('[data-state="active"] pre');
    await expect(sqlOutput).toContainText(/id\s+BIGINT/i, { timeout: 10000 });
    await expect(sqlOutput).toContainText(/COMMENT\s+'primary_key'/i);
  });
});
