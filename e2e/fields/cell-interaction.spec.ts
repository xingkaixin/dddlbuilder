import { test, expect } from '@playwright/test';
import { ensureBuilderVisible } from '../utils';

test.describe('单元格深度交互验证 @fields', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await ensureBuilderVisible(page);
  });

  test('常量和 SQL 表达式使用不同的默认值语义', async ({ page }) => {
    await page.locator('#table-name').fill('default_values');
    const row = page.getByTestId('data-table').locator('tbody tr').first();
    for (const [column, value] of [
      [2, 'label'],
      [4, 'varchar(50)'],
    ] as const) {
      const cell = row.locator(`td:nth-child(${column})`);
      await cell.dblclick();
      await cell.locator('input').fill(value);
      await page.keyboard.press('Enter');
    }
    const sql = page.locator('[role="tabpanel"]:visible pre');
    await expect(sql).toContainText(/label\s+VARCHAR\(50\)/);
    const kind = row.locator('td:nth-child(6)').getByRole('combobox');
    await kind.click();
    await page.getByRole('option', { name: '常量', exact: true }).click();
    const valueCell = row.locator('td:nth-child(7)');
    await valueCell.dblclick();
    await valueCell.locator('input').fill('now()');
    await page.keyboard.press('Enter');
    await expect(sql).toContainText("DEFAULT 'now()'");
    await kind.click();
    await page.getByRole('option', { name: 'SQL 表达式', exact: true }).click();
    await expect(sql).toContainText('DEFAULT now()');
    await expect(sql).not.toContainText("DEFAULT 'now()'");
    await kind.click();
    await page.getByRole('option', { name: '常量', exact: true }).click();
    await valueCell.dblclick();
    await valueCell.locator('input').fill('');
    await page.keyboard.press('Enter');
    await expect(sql).toContainText("DEFAULT ''");
  });

  test('场景：操作"可为空"复选框', async ({ page }) => {
    await page.locator('#table-name').fill('cell_test');

    // 输入字段名
    const firstFieldNameCell = page.locator(
      '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(2)',
    );
    await firstFieldNameCell.dblclick();
    await page.locator('[data-testid="data-table"] input:not([aria-hidden="true"])').fill('f1');
    await page.keyboard.press('Enter');
    await expect(firstFieldNameCell).toHaveText('f1', { timeout: 5000 });

    // 输入字段类型
    const firstFieldTypeCell = page.locator(
      '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(4)',
    );
    await firstFieldTypeCell.dblclick();
    await page.locator('[data-testid="data-table"] input:not([aria-hidden="true"])').fill('int');
    await page.keyboard.press('Enter');
    await expect(firstFieldTypeCell).toHaveText(/int/i, { timeout: 5000 });

    const sqlOutput = page.locator('[role="tabpanel"]:visible pre');
    // 等待 SQL 生成
    await expect(sqlOutput).toContainText(/f1\s+INT\s+NULL/i, {
      timeout: 10000,
    });

    // 点击第五列的 checkbox 切换 nullable
    const nullableCheckbox = page.locator(
      '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(5) [data-slot="checkbox"]',
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
    await page.locator('[data-testid="data-table"] input:not([aria-hidden="true"])').fill('id');
    await page.keyboard.press('Enter');

    // 第二个单元格：字段中文名
    const commentCell = page.locator(
      '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(3)',
    );
    await commentCell.dblclick();
    await page
      .locator('[data-testid="data-table"] input:not([aria-hidden="true"])')
      .fill('primary_key');
    await page.keyboard.press('Enter');

    // 第三个单元格：字段类型
    const typeCell = page.locator(
      '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(4)',
    );
    await typeCell.dblclick();
    await page.locator('[data-testid="data-table"] input:not([aria-hidden="true"])').fill('bigint');
    await page.keyboard.press('Enter');

    const sqlOutput = page.locator('[role="tabpanel"]:visible pre');
    await expect(sqlOutput).toContainText(/id\s+BIGINT/i, { timeout: 10000 });
    await expect(sqlOutput).toContainText(/COMMENT\s+'primary_key'/i);
  });

  test('场景：从编辑中的单元格点击到下一单元格后可直接输入', async ({ page }) => {
    await page.locator('#table-name').fill('cell_focus_test');

    const fieldNameCell = page.locator(
      '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(2)',
    );
    await fieldNameCell.click();
    await page.keyboard.type('fast_name');
    await expect(fieldNameCell.locator('input')).toHaveValue('fast_name');

    const commentCell = page.locator(
      '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(3)',
    );
    await commentCell.click();
    const commentInput = commentCell.locator('input');
    await expect(commentInput).toBeFocused();
    await page.keyboard.type('fast_comment');
    await expect(commentInput).toHaveValue('fast_comment');

    const typeCell = page.locator(
      '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(4)',
    );
    await typeCell.click();
    const typeInput = typeCell.locator('input');
    await expect(typeInput).toBeFocused();
    await page.keyboard.type('int');
    await expect(typeInput).toHaveValue('int');
  });
});
