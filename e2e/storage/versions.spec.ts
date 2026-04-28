import { test, expect } from '@playwright/test';

const fillBasicField = async (page: any, name = 'f1') => {
  const cell = page.locator('[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(2)');
  await cell.dblclick();
  await page.locator('[data-testid="data-table"] input').fill(name);

  const typeCell = page.locator('[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(4)');
  await typeCell.dblclick();
  await page.locator('[data-testid="data-table"] input').fill('int');
  await page.keyboard.press('Enter');
};

const getSavedTableRow = (page: any, pattern: RegExp) => {
  return page
    .locator('[data-testid^="saved-table-row:"]')
    .filter({ hasText: pattern })
    .filter({ hasNot: page.locator('[data-testid^="draft-badge:"]') });
};

const clickSavedTable = async (page: any, pattern: RegExp) => {
  const row = getSavedTableRow(page, pattern);
  const selectBtn = row.locator('button[data-testid^="table-select:"]');
  await selectBtn.click();
};

const openHistoryDialog = async (page: any, tableName: string) => {
  await page.getByRole('button', { name: /查看已保存表/i, exact: true }).click();
  await expect(page.getByRole('heading', { name: '已保存的表' })).toBeVisible();
  const savedRow = getSavedTableRow(page, new RegExp(tableName, 'i'));
  await savedRow.hover();
  await savedRow.getByRole('button', { name: /历史版本/i }).click();
  const dialog = page.getByRole('dialog', { name: /版本历史/i });
  await expect(dialog).toBeVisible();
  return dialog;
};

test.describe('版本管理验证 @storage', () => {
  test.beforeEach(async ({ context, page }) => {
    await context.addInitScript(() => {
      indexedDB.deleteDatabase('ddlbuilder');
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto('/');
    await expect(page.locator('#table-name')).toBeVisible({ timeout: 10000 });
  });

  test('场景：版本列表展示', async ({ page }) => {
    const tableName = 'version_test_' + Date.now();
    await page.locator('#table-name').fill(tableName);

    // 1. 保存初始版本
    await fillBasicField(page, 'f1');

    await page.getByRole('button', { name: /保存当前表/i }).click();
    await expect(page.getByText(/保存当前表|更新保存的表/i)).toBeVisible();
    await page.getByLabel('保存名称').fill(tableName);
    await page.getByRole('button', { name: /^保存$/ }).click();
    await expect(page.getByText(/保存当前表|更新保存的表/i)).toBeHidden();

    // 1.5 加载保存的表，进入更新流程
    await page.getByRole('button', { name: /查看已保存表/i, exact: true }).click();
    await expect(page.getByRole('heading', { name: '已保存的表' })).toBeVisible();
    await clickSavedTable(page, new RegExp(tableName, 'i'));
    await expect(page.getByText(new RegExp(`当前：${tableName}`))).toBeVisible();

    // 2. 修改并保存为新版本
    const cell = page.locator('[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(2)');
    await cell.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('f1_updated', { delay: 50 });
    await page.keyboard.press('Tab');

    await page.getByRole('button', { name: /保存当前表/i }).click();
    // 此时应该是更新逻辑
    await page.getByRole('button', { name: /^保存$/ }).click();
    await expect(page.getByText(/保存当前表|更新保存的表/i)).toBeHidden();

    // 3. 查看版本历史 (在已保存表抽屉中)
    const dialog = await openHistoryDialog(page, tableName);
    await expect(dialog.locator('button').filter({ hasText: /最新|初始版本/ })).toHaveCount(2);
  });

  test('场景：版本回滚', async ({ page }) => {
    const tableName = 'version_rollback_' + Date.now();
    await page.locator('#table-name').fill(tableName);
    await fillBasicField(page, 'f1');

    await page.getByRole('button', { name: /保存当前表/i }).click();
    await expect(page.getByText(/保存当前表|更新保存的表/i)).toBeVisible();
    await page.getByLabel('保存名称').fill(tableName);
    await page.getByRole('button', { name: /^保存$/ }).click();
    await expect(page.getByText(/保存当前表|更新保存的表/i)).toBeHidden();
    await page.waitForTimeout(300);

    await page.getByRole('button', { name: /查看已保存表/i, exact: true }).click();
    await expect(page.getByRole('heading', { name: '已保存的表' })).toBeVisible();
    await clickSavedTable(page, new RegExp(tableName, 'i'));
    await expect(page.getByText(new RegExp(`当前：${tableName}`))).toBeVisible();

    // 确认初始字段名为 f1
    const cell = page.locator('[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(2)');
    await expect(cell).toHaveText('f1', { timeout: 5000 });

    // 修改字段名
    await cell.dblclick();
    await page.locator('[data-testid="data-table"] input').fill('f1_updated');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // 保存修改
    await page.getByRole('button', { name: /保存当前表/i }).click();
    await page.getByRole('button', { name: /^保存$/ }).click();
    await expect(page.getByText(/保存当前表|更新保存的表/i)).toBeHidden();
    await page.waitForTimeout(300);

    // 确认字段名已更新
    await expect(cell).toHaveText('f1_updated', { timeout: 5000 });

    // 回滚到初始版本
    const dialog = await openHistoryDialog(page, tableName);
    await dialog.getByRole('button', { name: /初始版本/i }).click();
    await page.getByRole('button', { name: /回滚到(该|此)版本/i }).click();

    await expect(dialog).toBeHidden();
    await page.waitForTimeout(500);

    // 验证回滚成功
    await expect(cell).toHaveText('f1', { timeout: 10000 });
  });

  test('场景：删除版本', async ({ page }) => {
    const tableName = 'version_delete_' + Date.now();
    await page.locator('#table-name').fill(tableName);
    await fillBasicField(page, 'f1');

    await page.getByRole('button', { name: /保存当前表/i }).click();
    await expect(page.getByText(/保存当前表|更新保存的表/i)).toBeVisible();
    await page.getByLabel('保存名称').fill(tableName);
    await page.getByRole('button', { name: /^保存$/ }).click();
    await expect(page.getByText(/保存当前表|更新保存的表/i)).toBeHidden();

    await page.getByRole('button', { name: /查看已保存表/i, exact: true }).click();
    await expect(page.getByRole('heading', { name: '已保存的表' })).toBeVisible();
    await clickSavedTable(page, new RegExp(tableName, 'i'));

    const cell = page.locator('[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(2)');
    await cell.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('f1_updated', { delay: 50 });
    await page.keyboard.press('Tab');

    await page.getByRole('button', { name: /保存当前表/i }).click();
    await page.getByRole('button', { name: /^保存$/ }).click();
    await expect(page.getByText(/保存当前表|更新保存的表/i)).toBeHidden();

    const dialog = await openHistoryDialog(page, tableName);
    const versionItems = dialog.locator('button').filter({ hasText: /最新|初始版本/ });
    await expect(versionItems).toHaveCount(2);

    await dialog.getByRole('button', { name: /删除版本 1/i }).click();
    await expect(page.getByText('删除此版本？')).toBeVisible();
    await page.getByRole('button', { name: /确认删除|删除/i }).click();

    await expect(versionItems).toHaveCount(1);
  });
});
