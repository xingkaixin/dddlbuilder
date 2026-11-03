import { openAdvancedSettings } from '../utils';
import { test, expect } from '@playwright/test';
import { ensureBuilderVisible } from '../utils';

const openPartitionPanel = async (page: any) => {
  await openAdvancedSettings(page, /分区配置/i);
  const panel = page.getByRole('tabpanel', { name: /分区配置/i });
  await expect(panel).toBeVisible();
  const toggle = panel.getByRole('switch');
  await toggle.click();

  return panel;
};

const selectPartitionType = async (page: any, panel: any, type: string) => {
  await panel.getByRole('combobox').first().click();
  await page.getByRole('option', { name: new RegExp(`^${type}$`) }).click();
};

test.describe('MySQL 分区配置验证 @panels', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await ensureBuilderVisible(page);

    await page.locator('#table-name').fill('partition_test');

    // 添加字段
    const cell = page.locator('[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(2)');
    await cell.dblclick();
    await page.locator('[data-testid="data-table"] input:not([aria-hidden="true"])').fill('id');
    await page.keyboard.press('Enter');
    await expect(cell).toHaveText('id');

    const typeCell = page.locator(
      '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(4)',
    );
    await typeCell.dblclick();
    await page.locator('[data-testid="data-table"] input:not([aria-hidden="true"])').fill('int');
    await page.keyboard.press('Enter');
  });

  test('场景：配置为 KEY 分区并设置数量', async ({ page }) => {
    const partitionPanel = await openPartitionPanel(page);
    await selectPartitionType(page, partitionPanel, 'KEY');

    await page.getByPlaceholder(/输入表达式/i).fill('id');
    await partitionPanel.getByRole('spinbutton').fill('8');

    const sqlOutput = page.locator('[role="tabpanel"]:visible pre');
    await expect(sqlOutput).toContainText(/PARTITION BY KEY\(id\)/i);
    await expect(sqlOutput).toContainText(/PARTITIONS 8/i);
  });
});
