import { test, expect } from '@playwright/test';

const openPartitionPanel = async (page: any) => {
  await page.getByRole('tab', { name: /分区配置/i }).click();
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
    await expect(page.locator('#table-name')).toBeVisible({ timeout: 10000 });

    await page.locator('#table-name').fill('partition_test');

    // 添加字段
    const cell = page.locator('[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(2)');
    await cell.dblclick();
    await page.locator('[data-testid="data-table"] input').fill('id');
    await page.keyboard.press('Enter');
    await expect(cell).toHaveText('id');

    const typeCell = page.locator(
      '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(4)',
    );
    await typeCell.dblclick();
    await page.locator('[data-testid="data-table"] input').fill('int');
    await page.keyboard.press('Enter');
  });

  test('场景：配置为 HASH 分区', async ({ page }) => {
    // 切换到“分区配置”面板
    const partitionPanel = await openPartitionPanel(page);
    await expect(page.getByText('MySQL 分区表配置')).toBeVisible();
    await selectPartitionType(page, partitionPanel, 'HASH');

    // 输入分区表达式
    await page.getByPlaceholder(/输入表达式/i).fill('id');

    const sqlOutput = page.locator('[data-state="active"] pre');
    await expect(sqlOutput).toContainText(/PARTITION BY HASH\(id\)/i);
  });

  test('场景：配置为 KEY 分区并设置数量', async ({ page }) => {
    const partitionPanel = await openPartitionPanel(page);
    await selectPartitionType(page, partitionPanel, 'KEY');

    await page.getByPlaceholder(/输入表达式/i).fill('id');
    await partitionPanel.getByRole('spinbutton').fill('8');

    const sqlOutput = page.locator('[data-state="active"] pre');
    await expect(sqlOutput).toContainText(/PARTITION BY KEY\(id\)/i);
    await expect(sqlOutput).toContainText(/PARTITIONS 8/i);
  });

  test('场景：配置为 RANGE 分区并使用快捷生成', async ({ page }) => {
    const partitionPanel = await openPartitionPanel(page);
    await selectPartitionType(page, partitionPanel, 'RANGE');

    await page.getByPlaceholder(/输入表达式/i).fill('id');
    await page.getByRole('button', { name: /按年/i }).click();

    const sqlOutput = page.locator('[data-state="active"] pre');
    await expect(sqlOutput).toContainText(/PARTITION BY RANGE\(id\)/i);
  });

  test('场景：配置为 LIST 分区并添加分区定义', async ({ page }) => {
    const partitionPanel = await openPartitionPanel(page);
    await selectPartitionType(page, partitionPanel, 'LIST');

    await page.getByPlaceholder(/输入表达式/i).fill('id');
    await page.getByRole('button', { name: /添加分区/i }).click();

    await page.getByPlaceholder('分区名').fill('p1');
    await page.getByPlaceholder(/\(1, 2, 3\)/).fill('(1, 2)');

    const sqlOutput = page.locator('[data-state="active"] pre');
    await expect(sqlOutput).toContainText(/PARTITION BY LIST\(id\)/i);
  });
});
