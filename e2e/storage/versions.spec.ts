import { test, expect } from '@playwright/test';

const fillBasicField = async (page: any, name = 'f1') => {
  const cell = page.locator('.htCore tbody tr:nth-child(1) td:nth-child(2)');
  await cell.click();
  await page.keyboard.type(name, { delay: 30 });
  await page.keyboard.press('Tab');

  const typeCell = page.locator(
    '.htCore tbody tr:nth-child(1) td:nth-child(4)',
  );
  await typeCell.dblclick();
  await page.locator('textarea.handsontableInput').fill('int');
  await page.keyboard.press('Enter');
};

const openHistoryDialog = async (page: any, tableName: string) => {
  await page
    .getByRole('button', { name: /查看已保存表/i, exact: true })
    .click();
  await expect(page.getByText('已保存的表')).toBeVisible();
  const savedRow = page.getByRole('button', {
    name: new RegExp(tableName, 'i'),
  });
  await savedRow.hover();
  await savedRow
    .locator('..')
    .getByRole('button', { name: /历史版本/i })
    .click();
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
      localStorage.setItem('fireworks_shown_2026', 'true');
    });
    await page.goto('/');
    await expect(page.locator('#table-name')).toBeVisible({ timeout: 10000 });
  });

  test('场景：版本列表展示', async ({ page }) => {
    const tableName = 'version_test_' + Date.now();
    await page.locator('#table-name').fill(tableName);

    // 1. 保存初始版本
    await fillBasicField(page, 'f1');

    await page.locator('button[title="保存表"]').click();
    await expect(page.getByText(/保存当前表|更新保存的表/i)).toBeVisible();
    await page.getByLabel('保存名称').fill(tableName);
    await page.getByRole('button', { name: /^保存$/ }).click();
    await expect(page.getByText(/保存当前表|更新保存的表/i)).toBeHidden();

    // 1.5 加载保存的表，进入更新流程
    await page
      .getByRole('button', { name: /查看已保存表/i, exact: true })
      .click();
    await expect(page.getByText('已保存的表')).toBeVisible();
    await page
      .getByRole('button', { name: new RegExp(tableName, 'i') })
      .click();
    await expect(
      page.getByText(new RegExp(`当前：${tableName}`)),
    ).toBeVisible();

    // 2. 修改并保存为新版本
    const cell = page.locator('.htCore tbody tr:nth-child(1) td:nth-child(2)');
    await cell.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('f1_updated', { delay: 50 });
    await page.keyboard.press('Tab');

    await page.locator('button[title="保存表"]').click();
    // 此时应该是更新逻辑
    await page.getByRole('button', { name: /^保存$/ }).click();
    await expect(page.getByText(/保存当前表|更新保存的表/i)).toBeHidden();

    // 3. 查看版本历史 (在已保存表抽屉中)
    const dialog = await openHistoryDialog(page, tableName);
    await expect(
      dialog.locator('button').filter({ hasText: /最新|初始版本/ }),
    ).toHaveCount(2);
  });

  test('场景：版本回滚', async ({ page }) => {
    const tableName = 'version_rollback_' + Date.now();
    await page.locator('#table-name').fill(tableName);
    await fillBasicField(page, 'f1');

    await page.locator('button[title="保存表"]').click();
    await expect(page.getByText(/保存当前表|更新保存的表/i)).toBeVisible();
    await page.getByLabel('保存名称').fill(tableName);
    await page.getByRole('button', { name: /^保存$/ }).click();
    await expect(page.getByText(/保存当前表|更新保存的表/i)).toBeHidden();

    await page
      .getByRole('button', { name: /查看已保存表/i, exact: true })
      .click();
    await expect(page.getByText('已保存的表')).toBeVisible();
    await page
      .getByRole('button', { name: new RegExp(tableName, 'i') })
      .click();
    await expect(
      page.getByText(new RegExp(`当前：${tableName}`)),
    ).toBeVisible();

    const cell = page.locator('.htCore tbody tr:nth-child(1) td:nth-child(2)');
    await cell.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('f1_updated', { delay: 50 });
    await page.keyboard.press('Tab');

    await page.locator('button[title="保存表"]').click();
    await page.getByRole('button', { name: /^保存$/ }).click();
    await expect(page.getByText(/保存当前表|更新保存的表/i)).toBeHidden();

    const dialog = await openHistoryDialog(page, tableName);
    await dialog.getByRole('button', { name: /初始版本/i }).click();
    await page.getByRole('button', { name: /回滚到此版本/i }).click();

    await expect(dialog).toBeHidden();
    await expect(cell).toHaveText('f1');
  });

  test('场景：删除版本', async ({ page }) => {
    const tableName = 'version_delete_' + Date.now();
    await page.locator('#table-name').fill(tableName);
    await fillBasicField(page, 'f1');

    await page.locator('button[title="保存表"]').click();
    await expect(page.getByText(/保存当前表|更新保存的表/i)).toBeVisible();
    await page.getByLabel('保存名称').fill(tableName);
    await page.getByRole('button', { name: /^保存$/ }).click();
    await expect(page.getByText(/保存当前表|更新保存的表/i)).toBeHidden();

    await page
      .getByRole('button', { name: /查看已保存表/i, exact: true })
      .click();
    await expect(page.getByText('已保存的表')).toBeVisible();
    await page
      .getByRole('button', { name: new RegExp(tableName, 'i') })
      .click();

    const cell = page.locator('.htCore tbody tr:nth-child(1) td:nth-child(2)');
    await cell.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('f1_updated', { delay: 50 });
    await page.keyboard.press('Tab');

    await page.locator('button[title="保存表"]').click();
    await page.getByRole('button', { name: /^保存$/ }).click();
    await expect(page.getByText(/保存当前表|更新保存的表/i)).toBeHidden();

    const dialog = await openHistoryDialog(page, tableName);
    const versionItems = dialog
      .locator('button')
      .filter({ hasText: /最新|初始版本/ });
    await expect(versionItems).toHaveCount(2);

    const v1Row = dialog.getByRole('button', { name: /初始版本/i });
    await v1Row.hover();
    await v1Row.locator('button').click();
    await expect(page.getByText('删除此版本？')).toBeVisible();
    await page.getByRole('button', { name: /^删除$/ }).click();

    await expect(versionItems).toHaveCount(1);
  });
});
