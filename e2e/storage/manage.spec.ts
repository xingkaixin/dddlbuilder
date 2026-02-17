import { test, expect } from '@playwright/test';

const fillBasicField = async (page: any, name = 'id') => {
  const nameCell = page.locator(
    '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(2)',
  );
  await nameCell.dblclick();
  await page.locator('[data-testid="data-table"] input').fill(name);
  await page.keyboard.press('Enter');

  const typeCell = page.locator(
    '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(4)',
  );
  await typeCell.dblclick();
  await page.locator('[data-testid="data-table"] input').fill('int');
  await page.keyboard.press('Enter');
};

const saveTable = async (page: any, name: string, comment = '') => {
  await openSavedTables(page);
  await page.getByRole('button', { name: /草稿箱/i }).click();
  await page.locator('#table-name').fill(name);
  if (comment) {
    await page.locator('#table-comment').fill(comment);
  }
  await fillBasicField(page);
  await page.getByRole('button', { name: /保存当前表/i }).click();
  await expect(page.getByText(/保存当前表|更新保存的表/i)).toBeVisible();
  const nameInput = page.getByLabel('保存名称');
  if (await nameInput.isEnabled()) {
    await nameInput.fill(name);
  }
  await page.getByRole('button', { name: /^保存$/ }).click();
  await expect(page.getByText(/保存当前表|更新保存的表/i)).toBeHidden();
};

const openSavedTables = async (page: any) => {
  const heading = page.getByRole('heading', { name: '已保存的表' });
  if (await heading.isVisible().catch(() => false)) {
    return;
  }
  await page.getByRole('button', { name: /查看已保存表/i }).click();
  await expect(heading).toBeVisible();
};

test.describe('保存表管理补充 @storage', () => {
  test.beforeEach(async ({ context, page }) => {
    await context.addInitScript(() => {
      indexedDB.deleteDatabase('ddlbuilder');
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('ddlbuilder:fireworks:cny:shown:2026:v1', 'true');
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

    const deleteConfirmDialog = page
      .getByRole('dialog')
      .filter({ hasText: '确认删除保存的表？' });
    await expect(deleteConfirmDialog).toBeVisible();
    await deleteConfirmDialog.getByRole('button', { name: /^删除$/ }).click();

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
      '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(2)',
    );
    await nameCell.dblclick();
    await page.locator('[data-testid="data-table"] input').fill('id_changed');
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

  test('场景：全局草稿与保存表草稿应隔离', async ({ page }) => {
    const tableName = `e2e_isolation_${Date.now()}`;
    const savedComment = '保存版本注释V2';
    const globalDraftComment = '全局草稿注释';
    const savedEditedComment = '保存表草稿注释';

    await page.locator('#table-name').fill(tableName);
    await page.locator('#table-comment').fill(savedComment);
    await fillBasicField(page, 'isolation_id');
    await page.getByRole('button', { name: /保存当前表/i }).click();
    await expect(page.getByText(/保存当前表|更新保存的表/i)).toBeVisible();
    await page.getByLabel('保存名称').fill(tableName);
    await page.getByRole('button', { name: /^保存$/ }).click();
    await expect(page.getByText(/保存当前表|更新保存的表/i)).toBeHidden();

    await openSavedTables(page);
    await page.getByRole('button', { name: /草稿箱/i }).click();
    await page.locator('#table-comment').fill(globalDraftComment);

    await openSavedTables(page);
    await page
      .getByRole('button', { name: new RegExp(tableName, 'i') })
      .click();
    await expect(page.locator('#table-comment')).toHaveValue(savedComment);

    await page.locator('#table-comment').fill(savedEditedComment);
    await page.getByRole('button', { name: /保存当前表/i }).click();
    await expect(page.getByText(/保存当前表|更新保存的表/i)).toBeVisible();
    await page.getByRole('button', { name: /^保存$/ }).click();
    await expect(page.getByText(/保存当前表|更新保存的表/i)).toBeHidden();

    await openSavedTables(page);
    await page.getByRole('button', { name: /草稿箱/i }).click();
    await expect(page.locator('#table-comment')).toHaveValue(
      globalDraftComment,
    );

    await openSavedTables(page);
    await page
      .getByRole('button', { name: new RegExp(tableName, 'i') })
      .click();
    await expect(page.locator('#table-comment')).toHaveValue(
      savedEditedComment,
    );
  });

  test('场景：重命名应保留已保存版本，删除后可重新保存', async ({ page }) => {
    const originalName = `e2e_draft_lifecycle_${Date.now()}`;
    const renamedName = `${originalName}_renamed`;
    const initialSavedComment = 'initial_saved_comment';
    const draftComment = 'rename_after_draft_comment';
    const freshSavedComment = 'fresh_saved_after_delete';
    const globalComment = 'global_after_lifecycle';

    await page.locator('#table-name').fill(originalName);
    await page.locator('#table-comment').fill(initialSavedComment);
    await fillBasicField(page, 'draft_lifecycle_id');
    await page.getByRole('button', { name: /保存当前表/i }).click();
    await expect(page.getByText(/保存当前表|更新保存的表/i)).toBeVisible();
    await page.getByLabel('保存名称').fill(originalName);
    await page.getByRole('button', { name: /^保存$/ }).click();
    await expect(page.getByText(/保存当前表|更新保存的表/i)).toBeHidden();

    await page.locator('#table-comment').fill(draftComment);

    await openSavedTables(page);
    const row = page.getByRole('button', {
      name: new RegExp(originalName, 'i'),
    });
    await row.hover();
    await row
      .locator('..')
      .getByRole('button', { name: /重命名/i })
      .click();
    await expect(page.getByText('重命名保存的表')).toBeVisible();
    await page.getByLabel('新名称').fill(renamedName);
    await page.getByRole('button', { name: /确认/i }).click();
    await expect(page.getByText('重命名保存的表')).toBeHidden();

    await openSavedTables(page);
    await page.getByRole('button', { name: /草稿箱/i }).click();
    await page.locator('#table-comment').fill(globalComment);

    await openSavedTables(page);
    await page
      .getByRole('button', { name: new RegExp(renamedName, 'i') })
      .click();
    await expect(page.locator('#table-comment')).toHaveValue(
      initialSavedComment,
    );

    await openSavedTables(page);
    const renamedRow = page.getByRole('button', {
      name: new RegExp(renamedName, 'i'),
    });
    await renamedRow.hover();
    await renamedRow
      .locator('..')
      .getByRole('button', { name: /删除/i })
      .click();
    const deleteConfirmDialog = page
      .getByRole('dialog')
      .filter({ hasText: '确认删除保存的表？' });
    await expect(deleteConfirmDialog).toBeVisible();
    await deleteConfirmDialog.getByRole('button', { name: /^删除$/ }).click();
    await expect(deleteConfirmDialog).toBeHidden();

    await saveTable(page, renamedName, freshSavedComment);

    await openSavedTables(page);
    await page
      .getByRole('button', { name: new RegExp(renamedName, 'i') })
      .click();
    await expect(page.locator('#table-comment')).toHaveValue(freshSavedComment);
  });
});
