import { test, expect } from '@playwright/test';
import { ensureBuilderVisible } from '../utils';

test('Mock 数据遵守字段类型、长度和精度 @tools', async ({ page }) => {
  await page.goto('/');
  await ensureBuilderVisible(page);
  await page.locator('#table-name').fill('mock_constraints');

  const columns = [
    ['gender', 'TINYINT'],
    ['name', 'VARCHAR(1)'],
    ['balance', 'DECIMAL(3,2)'],
  ];
  for (const [index, [name, type]] of columns.entries()) {
    const row = page.locator('[data-testid="data-table"] tbody tr').nth(index);
    const nameCell = row.locator('td').nth(1);
    await nameCell.dblclick();
    await page.locator('[data-testid="data-table"] input:not([aria-hidden="true"])').fill(name);
    await page.keyboard.press('Enter');
    await expect(nameCell).toHaveText(name);

    const typeCell = row.locator('td').nth(3);
    await typeCell.dblclick();
    await page.locator('[data-testid="data-table"] input:not([aria-hidden="true"])').fill(type);
    await page.keyboard.press('Enter');
    await expect(typeCell).toHaveText(type);
  }

  await page.getByRole('button', { name: 'Mock 数据', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Mock 数据生成器' });
  await dialog.getByRole('tab', { name: 'JSON', exact: true }).click();
  const output = dialog.getByRole('tabpanel', { name: 'JSON', exact: true }).locator('pre');
  await expect(output).toContainText('"gender"');

  const rows = JSON.parse(await output.innerText()) as Record<string, unknown>[];
  expect(rows).toHaveLength(10);
  for (const row of rows) {
    if (row.gender !== null) {
      expect(Number.isInteger(row.gender)).toBe(true);
      expect(row.gender).toBeGreaterThanOrEqual(-128);
      expect(row.gender).toBeLessThanOrEqual(127);
    }
    if (row.name !== null) {
      expect(typeof row.name).toBe('string');
      expect(Array.from(row.name as string).length).toBeLessThanOrEqual(1);
    }
    if (row.balance !== null) {
      expect(typeof row.balance).toBe('number');
      expect(Math.abs(row.balance as number)).toBeLessThan(10);
    }
  }

  await dialog.getByRole('tab', { name: 'INSERT SQL', exact: true }).click();
  await expect(dialog.getByRole('tabpanel', { name: 'INSERT SQL', exact: true })).toContainText(
    'INSERT INTO `mock_constraints`',
  );
});
