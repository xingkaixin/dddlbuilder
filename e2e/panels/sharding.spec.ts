import { test, expect } from '@playwright/test';

test.describe('PostgreSQL Citus 分片配置验证 @panels', () => {
  test.beforeEach(async ({ context, page }) => {
    await context.addInitScript(() => {
      window.localStorage.setItem(
        'ddlbuilder:fireworks:cny:shown:2026:v1',
        'true',
      );
    });
    await page.goto('/');
    await expect(page.locator('#table-name')).toBeVisible({ timeout: 10000 });
  });

  test('场景：配置为分布式表', async ({ page }) => {
    // 切换到 PostgreSQL (Citus)
    await page.locator('[data-testid="db-type-selector"]').click();
    await page.getByRole('option', { name: /PostgreSQL \(Citus\)/i }).click();

    await page.locator('#table-name').fill('sharded_table');

    // 添加字段
    const cell = page.locator(
      '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(2)',
    );
    await cell.dblclick();
    await page.locator('[data-testid="data-table"] input').fill('user_id');
    await page.keyboard.press('Enter');
    await expect(cell).toHaveText('user_id');

    const typeCell = page.locator(
      '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(4)',
    );
    await typeCell.dblclick();
    await page.locator('[data-testid="data-table"] input').fill('int');
    await page.keyboard.press('Enter');

    // 切换到“PostgreSQL Citus”面板 (如果已显示)
    // 检查 UI 是否有专门的 Citus 面板
    // 切换到“分片配置”面板
    await page.getByText('分片配置').click();

    // 选择分片模式为“分片表” (Button)
    await page.getByRole('button', { name: /分片表/i }).click();

    // 选择分片字段
    const panel = page.getByRole('tabpanel', { name: /分片配置/i });
    await panel.getByRole('combobox').click();
    await page.getByRole('option', { name: /user_id/i }).click();

    const sqlOutput = page.locator('[data-state="active"] pre');
    await expect(sqlOutput).toContainText(
      /SELECT create_distributed_table\('sharded_table', 'user_id'\)/i,
    );
  });

  test('场景：配置为副本表', async ({ page }) => {
    await page.locator('[data-testid="db-type-selector"]').click();
    await page.getByRole('option', { name: /PostgreSQL \(Citus\)/i }).click();

    await page.locator('#table-name').fill('reference_table');

    const cell = page.locator(
      '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(2)',
    );
    await cell.dblclick();
    await page.locator('[data-testid="data-table"] input').fill('id');
    await page.keyboard.press('Enter');

    const typeCell = page.locator(
      '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(4)',
    );
    await typeCell.dblclick();
    await page.locator('[data-testid="data-table"] input').fill('int');
    await page.keyboard.press('Enter');

    await page.getByText('分片配置').click();
    await page.getByRole('button', { name: /副本表/i }).click();

    const sqlOutput = page.locator('[data-state="active"] pre');
    await expect(sqlOutput).toContainText(
      /SELECT create_reference_table\('reference_table'\)/i,
    );
  });

  test('场景：无字段提示', async ({ page }) => {
    await page.locator('[data-testid="db-type-selector"]').click();
    await page.getByRole('option', { name: /PostgreSQL \(Citus\)/i }).click();

    await page.locator('#table-name').fill('empty_table');

    await page.getByText('分片配置').click();
    await page.getByRole('button', { name: /分片表/i }).click();
    await expect(page.getByText(/请先在字段配置中添加字段/)).toBeVisible();
  });
});
