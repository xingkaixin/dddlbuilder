import { test, expect } from '@playwright/test';
import { ensureBuilderVisible } from './utils';

test('debug version rollback', async ({ context, page }) => {
  await context.addInitScript(() => {
    indexedDB.deleteDatabase('ddlbuilder');
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto('/');
  await ensureBuilderVisible(page);

  const tableName = 'version_rollback_' + Date.now();
  await page.locator('#table-name').fill(tableName);

  // Fill field
  const cell = page.locator('[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(2)');
  await cell.dblclick();
  await page.locator('[data-testid="data-table"] input').fill('f1');
  const typeCell = page.locator('[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(4)');
  await typeCell.dblclick();
  await page.locator('[data-testid="data-table"] input').fill('int');
  await page.keyboard.press('Enter');

  // Save
  await page.getByRole('button', { name: /保存当前表/i }).click();
  await expect(page.getByRole('heading', { name: /保存当前表|更新保存的表/i })).toBeVisible();
  await page.getByLabel('保存名称').fill(tableName);
  await page.getByRole('button', { name: /^保存$/ }).click();
  await expect(page.getByRole('heading', { name: /保存当前表|更新保存的表/i })).toBeHidden();
  await page.waitForTimeout(300);

  // Load saved table
  await page.getByRole('button', { name: '工作区' }).click();
  await expect(page.getByRole('heading', { name: '工作区' })).toBeVisible();

  const drawer = page.getByRole('dialog', { name: /工作区/i });
  const row = drawer
    .locator('[data-testid^="saved-table-row:"]')
    .filter({ hasText: new RegExp(tableName, 'i') });
  const selectBtn = row.locator('button[data-testid^="table-select:"]').first();
  await selectBtn.click();
  await expect(page.getByText(new RegExp(`当前：${tableName}`))).toBeVisible();

  // Modify field
  await expect(cell).toHaveText('f1', { timeout: 5000 });
  await cell.dblclick();
  await page.locator('[data-testid="data-table"] input').fill('f1_updated');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);

  // Check save button state
  const saveBtn = page.getByRole('button', { name: /保存当前表/i });
  const disabled = await saveBtn.isDisabled();
  console.log('Save button disabled:', disabled);

  await saveBtn.click();
  await page.waitForTimeout(500);

  // Check if dialog opened
  const dialogHeading = page.getByRole('heading', { name: /保存当前表|更新保存的表/i });
  const dialogVisible = await dialogHeading.isVisible().catch(() => false);
  console.log('Dialog heading visible:', dialogVisible);

  // Check for save button in dialog
  const confirmBtn = page.getByRole('button', { name: /^保存$/ });
  const confirmVisible = await confirmBtn.isVisible().catch(() => false);
  console.log('Confirm button visible:', confirmVisible);

  await page.screenshot({ path: '/tmp/debug-versions.png', fullPage: true });
});
