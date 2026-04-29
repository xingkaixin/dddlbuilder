import { test, expect } from '@playwright/test';
import { confirmFieldTypeChangeIfNeeded } from '../utils';

const fillBasicField = async (page: any, name = 'id') => {
  const nameCell = page.locator('[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(2)');
  await nameCell.dblclick();
  await page.locator('[data-testid="data-table"] input').fill(name);
  await page.keyboard.press('Enter');

  const typeCell = page.locator('[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(4)');
  await typeCell.dblclick();
  await page.locator('[data-testid="data-table"] input').fill('int');
  await page.keyboard.press('Enter');
};

const getSavedTableRow = (page: any, pattern: RegExp) => {
  return page.locator('[data-testid^="saved-table-row:"]').filter({ hasText: pattern });
};

const clickSavedTable = async (page: any, pattern: RegExp) => {
  const row = getSavedTableRow(page, pattern);
  const selectBtn = row.locator('button[data-testid^="table-select:"]');
  await selectBtn.click();
};

test.describe('变更对比验证 @storage', () => {
  test.beforeEach(async ({ context, page }) => {
    await context.addInitScript(() => {
      indexedDB.deleteDatabase('ddlbuilder');
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto('/');
    await expect(page.locator('#table-name')).toBeVisible({ timeout: 10000 });
  });

  test('场景：打开变更对比弹窗', async ({ page }) => {
    const tableName = `diff_test_${Date.now()}`;
    await page.locator('#table-name').fill(tableName);
    await fillBasicField(page, 'f1');

    await page.getByRole('button', { name: /保存当前表/i }).click();
    await expect(page.getByRole('heading', { name: /保存当前表|更新保存的表/i })).toBeVisible();
    await page.getByLabel('保存名称').fill(tableName);
    await page.getByRole('button', { name: /^保存$/ }).click();
    await expect(page.getByRole('heading', { name: /保存当前表|更新保存的表/i })).toBeHidden();

    await page.getByRole('button', { name: '工作区' }).click();
    await expect(page.getByRole('heading', { name: '工作区' })).toBeVisible();
    await clickSavedTable(page, new RegExp(tableName, 'i'));
    await expect(page.getByText(new RegExp(`当前：${tableName}`))).toBeVisible();

    const typeCell = page.locator(
      '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(4)',
    );
    await typeCell.dblclick();
    await page.locator('[data-testid="data-table"] input').fill('varchar(20)');
    await page.keyboard.press('Enter');
    await confirmFieldTypeChangeIfNeeded(page);

    await page.getByRole('button', { name: /查看表结构变更/i }).click();
    await expect(page.getByRole('heading', { name: /表结构变更对比/i })).toBeVisible();
    await expect(page.getByText(/字段变更/)).toBeVisible();
  });
});
