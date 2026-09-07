import { openFieldTool } from '../utils';
import { test, expect } from '@playwright/test';
import { setupHydratedState } from '../utils';

test.describe('容量估算工具验证 @tools', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await setupHydratedState(page);

    await page.locator('#table-name').fill('capacity_test');

    // 添加 bigint 字段
    const cell = page.locator('[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(2)');
    await cell.dblclick();
    await page.locator('[data-testid="data-table"] input:not([aria-hidden="true"])').fill('id');
    await page.keyboard.press('Tab');
    await page.keyboard.type('bigint', { delay: 50 });
    await page.keyboard.press('Enter');
  });

  test('场景：打开容量估算器并查看结果', async ({ page }) => {
    await openFieldTool(page, '数据工具', /估算容量/i);

    const dialog = page.getByRole('dialog', { name: /存储容量估算器/i });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/预估承载数据量/i)).toBeVisible();
    await expect(dialog.getByText('裸数据', { exact: true })).toBeVisible();
    await expect(dialog.getByText('索引占用', { exact: true })).toBeVisible();
    await expect(dialog.getByText('冗余开销', { exact: true })).toBeVisible();
    await expect(dialog.getByText('磁盘占用合计', { exact: true })).toBeVisible();
  });
});
