import { test, expect } from '@playwright/test';

const fillBasicField = async (page: any, name = 'id') => {
  const nameCell = page.locator(
    '.ht_clone_inline_start .htCore tbody tr:nth-child(1) td:nth-child(2)',
  );
  await nameCell.dblclick();
  await page.locator('textarea.handsontableInput').fill(name);
  await page.keyboard.press('Enter');

  const typeCell = page.locator(
    '.ht_master .htCore tbody tr:nth-child(1) td:nth-child(4)',
  );
  await typeCell.dblclick();
  await page.locator('textarea.handsontableInput').fill('int');
  await page.keyboard.press('Enter');
};

const saveTable = async (page: any, name: string) => {
  await page.locator('#table-name').fill(name);
  await fillBasicField(page);
  await page.locator('button[title="保存表"]').click();
  await expect(page.getByText(/保存当前表|更新保存的表/i)).toBeVisible();
  const nameInput = page.getByLabel('保存名称');
  if (await nameInput.isEnabled()) {
    await nameInput.fill(name);
  }
  await page.getByRole('button', { name: /^保存$/ }).click();
  await expect(page.getByText(/保存当前表|更新保存的表/i)).toBeHidden();
};

const openSavedTables = async (page: any) => {
  await page.getByRole('button', { name: /查看已保存表/i }).click();
  await expect(page.getByText('已保存的表')).toBeVisible();
};

test.describe('保存表管理补充 @storage', () => {
  test.beforeEach(async ({ context, page }) => {
    await context.addInitScript(() => {
      indexedDB.deleteDatabase('ddlbuilder');
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('fireworks_shown_2026', 'true');
    });
    await page.goto('/');
    await expect(page.locator('#table-name')).toBeVisible();
  });

  test('场景：重命名保存表', async ({ page }) => {
    const baseName = `e2e_rename_${Date.now()}`;
    const nextName = `${baseName}_renamed`;

    await saveTable(page, baseName);
    await openSavedTables(page);
    await page.getByRole('button', { name: new RegExp(baseName, 'i') }).click();

    await openSavedTables(page);
    const row = page.getByRole('button', { name: new RegExp(baseName, 'i') });
    await row.hover();
    await row
      .locator('..')
      .getByRole('button', { name: /重命名/i })
      .click();

    await expect(page.getByText('重命名保存的表')).toBeVisible();
    await page.getByLabel('新名称').fill(nextName);
    await page.getByRole('button', { name: /确认/i }).click();

    await expect(
      page.getByRole('button', { name: new RegExp(nextName, 'i') }),
    ).toBeVisible();
    await expect(page.getByText(new RegExp(`当前：${nextName}`))).toBeVisible();
  });

  test('场景：删除保存表', async ({ page }) => {
    const tableName = `e2e_delete_${Date.now()}`;

    await saveTable(page, tableName);
    await openSavedTables(page);

    const row = page.getByRole('button', { name: new RegExp(tableName, 'i') });
    await row.hover();
    await row.locator('..').getByRole('button', { name: /删除/i }).click();

    await expect(page.getByText('确认删除保存的表？')).toBeVisible();
    await page.getByRole('button', { name: /^删除$/ }).click();

    await expect(
      page.getByRole('button', { name: new RegExp(tableName, 'i') }),
    ).toHaveCount(0);
  });

  test('场景：未保存修改加载确认', async ({ page }) => {
    const tableA = `e2e_load_a_${Date.now()}`;
    const tableB = `e2e_load_b_${Date.now()}`;

    await saveTable(page, tableA);
    await saveTable(page, tableB);

    await openSavedTables(page);
    await page.getByRole('button', { name: new RegExp(tableA, 'i') }).click();
    await expect(page.getByText(new RegExp(`当前：${tableA}`))).toBeVisible();

    const nameCell = page.locator(
      '.ht_clone_inline_start .htCore tbody tr:nth-child(1) td:nth-child(2)',
    );
    await nameCell.dblclick();
    await page.locator('textarea.handsontableInput').fill('id_changed');
    await page.keyboard.press('Enter');

    await openSavedTables(page);
    await page.getByRole('button', { name: new RegExp(tableB, 'i') }).click();

    await expect(page.getByText('加载保存的表')).toBeVisible();
    await page.getByRole('button', { name: /取消/i }).click();
    await expect(page.getByText(new RegExp(`当前：${tableA}`))).toBeVisible();
  });

  test('场景：搜索过滤', async ({ page }) => {
    const tableA = `e2e_search_a_${Date.now()}`;
    const tableB = `e2e_search_b_${Date.now()}`;

    await saveTable(page, tableA);
    await saveTable(page, tableB);

    await openSavedTables(page);
    await page.getByPlaceholder(/搜索表名或数据库类型/i).fill(tableA);

    await expect(
      page.getByRole('button', { name: new RegExp(tableA, 'i') }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: new RegExp(tableB, 'i') }),
    ).toHaveCount(0);
  });
});
