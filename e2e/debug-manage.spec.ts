import { test, expect } from '@playwright/test';

test('debug rename', async ({ context, page }) => {
  await context.addInitScript(() => {
    indexedDB.deleteDatabase('ddlbuilder');
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto('/');
  await expect(page.locator('#table-name')).toBeVisible();

  const tableName = `e2e_rename_${Date.now()}`;
  await page.locator('#table-name').fill(tableName);

  const nameCell = page.locator('[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(2)');
  await nameCell.dblclick();
  await page.locator('[data-testid="data-table"] input').fill('id');
  await page.keyboard.press('Enter');
  const typeCell = page.locator('[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(4)');
  await typeCell.dblclick();
  await page.locator('[data-testid="data-table"] input').fill('int');
  await page.keyboard.press('Enter');

  await page.getByRole('button', { name: /保存当前表/i }).click();
  await expect(page.getByRole('heading', { name: /保存当前表|更新保存的表/i })).toBeVisible();
  await page.getByLabel('保存名称').fill(tableName);
  await page.getByRole('button', { name: /^保存$/ }).click();
  await expect(page.getByRole('heading', { name: /保存当前表|更新保存的表/i })).toBeHidden();

  // Check sidebar content
  const sidebar = page.locator('aside');
  const sidebarText = await sidebar.textContent();
  console.log('Sidebar contains tableName:', sidebarText?.includes(tableName));

  // Try to find the table item
  const tableBtn = sidebar.locator('button').filter({ hasText: new RegExp(tableName, 'i') });
  const btnCount = await tableBtn.count();
  console.log('Table button count:', btnCount);

  if (btnCount > 0) {
    const box = await tableBtn.first().boundingBox();
    console.log('Table button box:', JSON.stringify(box));
  }

  // Check for group divs
  const groups = sidebar.locator('div.group');
  const groupCount = await groups.count();
  console.log('Group div count:', groupCount);

  // Try to find the rename button directly
  const renameBtn = sidebar.getByRole('button', { name: /重命名/i });
  const renameCount = await renameBtn.count();
  console.log('Rename button count:', renameCount);

  await page.screenshot({ path: '/tmp/debug-manage.png', fullPage: true });
});
