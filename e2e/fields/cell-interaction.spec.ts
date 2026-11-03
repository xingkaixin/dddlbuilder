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
});
