import { test, expect } from '@playwright/test';
import { ensureBuilderVisible } from '../utils';

const fillBasicField = async (page: any, name = 'id') => {
  const nameCell = page.locator('[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(2)');
  await nameCell.dblclick();
  await page.locator('[data-testid="data-table"] input:not([aria-hidden="true"])').fill(name);
  await page.keyboard.press('Enter');

  const typeCell = page.locator('[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(4)');
  await typeCell.dblclick();
  await page.locator('[data-testid="data-table"] input:not([aria-hidden="true"])').fill('int');
  await page.keyboard.press('Enter');
};

// 保存新表（弹对话框）
const saveNewTable = async (page: any, name: string, comment = '') => {
  await page.locator('#table-name').fill(name);
  if (comment) {
    await page.locator('#table-comment').fill(comment);
  }
  await fillBasicField(page);
  await page.getByRole('button', { name: /保存当前表/i }).click();
  await expect(page.getByRole('heading', { name: /保存当前表|更新保存的表/i })).toBeVisible();
  const nameInput = page.getByLabel('保存名称');
  if (await nameInput.isEnabled()) {
    await nameInput.fill(name);
  }
  await page.getByRole('button', { name: /^保存$/ }).click();
  await expect(page.getByRole('heading', { name: /保存当前表|更新保存的表/i })).toBeHidden();
};

// 在侧边栏中点击保存的表
const clickSidebarTable = async (page: any, pattern: RegExp) => {
  const sidebar = page.locator('aside');
  const tableBtn = sidebar.locator('button').filter({ hasText: pattern }).first();
  await tableBtn.click();
};

// 获取侧边栏中的保存的表项
const getSidebarTableItem = (page: any, pattern: RegExp) => {
  const sidebar = page.locator('aside');
  return sidebar.locator('div.group').filter({ hasText: pattern }).first();
};

// 在侧边栏中对表项执行下拉菜单操作
const sidebarTableAction = async (page: any, pattern: RegExp, action: RegExp) => {
  const item = getSidebarTableItem(page, pattern);
  await item.hover();
  const moreBtn = item.locator('button').last();
  await moreBtn.click();
  await page.getByRole('menuitem').filter({ hasText: action }).click();
};

// 点击侧边栏中的第一个草稿（若无则通过 TabBar 新建）
const clickFirstDraft = async (page: any) => {
  const sidebar = page.locator('aside');
  const draftSection = sidebar.locator('section').first();
  const firstDraftButton = draftSection.getByRole('button').first();
  if ((await firstDraftButton.count()) > 0) {
    const clicked = await firstDraftButton
      .click({ timeout: 1000 })
      .then(() => true)
      .catch(() => false);
    if (clicked) {
      return;
    }
  }
  await page.getByRole('button', { name: /新建草稿|new draft/i }).click();
};

const createNewDraft = async (page: any) => {
  await page.getByRole('button', { name: /新建草稿|new draft/i }).click();
};

test.describe('保存表管理补充 @storage', () => {
  test.beforeEach(async ({ context, page }) => {
    await context.addInitScript(() => {
      indexedDB.deleteDatabase('ddlbuilder');
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto('/');
    await ensureBuilderVisible(page);
  });

  test('场景：重命名保存表', async ({ page }) => {
    const baseName = `e2e_rename_${Date.now()}`;
    const nextName = `${baseName}_renamed`;

    await saveNewTable(page, baseName);

    await sidebarTableAction(page, new RegExp(baseName, 'i'), /重命名/);

    await expect(page.getByText('重命名保存的表')).toBeVisible();
    await page.getByLabel('新名称').fill(nextName);
    await page.getByRole('button', { name: /确认/i }).click();

    await expect(page.getByText(new RegExp(`当前：${nextName}`))).toBeVisible();
  });

  test('场景：删除并恢复保存表', async ({ page }) => {
    const tableName = `e2e_delete_${Date.now()}`;
    const tableComment = 'restored_table_comment';

    await saveNewTable(page, tableName, tableComment);

    await sidebarTableAction(page, new RegExp(tableName, 'i'), /删除/);

    const deleteConfirmDialog = page.getByRole('dialog').filter({ hasText: /移入回收站/ });
    await expect(deleteConfirmDialog).toBeVisible();
    await deleteConfirmDialog.getByRole('button', { name: /移入回收站/i }).click();
    await expect(deleteConfirmDialog).toBeHidden();

    // 表被移到回收站，不应在项目列表中显示
    const sidebar = page.locator('aside');
    const projectsSection = sidebar.locator('section').filter({ hasText: /^项目/ });
    await expect(
      projectsSection.locator('button').filter({ hasText: new RegExp(tableName, 'i') }),
    ).toHaveCount(0);

    await sidebar
      .getByRole('button', { name: /回收站/ })
      .last()
      .click();
    const trashSection = sidebar.locator('section').filter({ hasText: /^回收站/ });
    const trashItem = trashSection
      .locator('div.group')
      .filter({
        hasText: new RegExp(tableName, 'i'),
      })
      .first();
    await expect(trashItem).toBeVisible();
    await trashItem.hover();
    await trashItem.locator('button').last().click();
    await page.getByRole('menuitem', { name: /恢复/ }).click();

    await sidebar
      .getByRole('button', { name: /回收站/ })
      .last()
      .click();
    await expect(getSidebarTableItem(page, new RegExp(tableName, 'i'))).toBeVisible();
    await clickSidebarTable(page, new RegExp(tableName, 'i'));
    await expect(page.locator('#table-comment')).toHaveValue(tableComment);
  });

  test('场景：未保存修改加载确认', async ({ page }) => {
    const tableA = `e2e_load_a_${Date.now()}`;
    const tableB = `e2e_load_b_${Date.now()}`;

    // 保存两个表（需要先切换到草稿状态以重置 hasLoadedTable）
    await saveNewTable(page, tableA);
    await createNewDraft(page);
    await saveNewTable(page, tableB);

    // 加载表 A
    await clickSidebarTable(page, new RegExp(tableA, 'i'));
    await expect(page.getByText(new RegExp(`当前：${tableA}`))).toBeVisible();

    // 修改表 A（触发 dirty 状态）
    await page.locator('#table-name').fill(`${tableA}_modified`);
    await page.waitForTimeout(300);

    // tabs 模式下，dirty 状态不会阻止加载其他保存的表，直接切换/激活对应标签页
    await clickSidebarTable(page, new RegExp(tableB, 'i'));
    await expect(page.getByText(new RegExp(`当前：${tableB}`))).toBeVisible();
  });

  test('场景：搜索过滤', async ({ page }) => {
    const tableA = `e2e_search_a_${Date.now()}`;
    const tableB = `e2e_search_b_${Date.now()}`;

    await saveNewTable(page, tableA);
    await createNewDraft(page);
    await saveNewTable(page, tableB);

    const sidebar = page.locator('aside');
    await sidebar.getByPlaceholder(/搜索表名/).fill(tableA);

    await expect(getSidebarTableItem(page, new RegExp(tableA, 'i'))).toBeVisible();
    await expect(getSidebarTableItem(page, new RegExp(tableB, 'i'))).toHaveCount(0);
  });

  test('场景：全局草稿与保存表草稿应隔离', async ({ page }) => {
    const tableName = `e2e_isolation_${Date.now()}`;
    const savedComment = '保存版本注释V2';
    const globalDraftComment = '全局草稿注释';
    const savedEditedComment = '保存表草稿注释';

    // 保存表
    await page.locator('#table-name').fill(tableName);
    await page.locator('#table-comment').fill(savedComment);
    await fillBasicField(page, 'isolation_id');
    await page.getByRole('button', { name: /保存当前表/i }).click();
    await expect(page.getByRole('heading', { name: /保存当前表|更新保存的表/i })).toBeVisible();
    await page.getByLabel('保存名称').fill(tableName);
    await page.getByRole('button', { name: /^保存$/ }).click();
    await expect(page.getByRole('heading', { name: /保存当前表|更新保存的表/i })).toBeHidden();

    // 切换到草稿并修改
    await clickFirstDraft(page);
    await page.locator('#table-comment').fill(globalDraftComment);
    // 等待草稿持久化（debounce 500ms）
    await page.waitForTimeout(700);

    // 加载保存的表，应显示保存的注释
    await clickSidebarTable(page, new RegExp(tableName, 'i'));
    await expect(page.locator('#table-comment')).toHaveValue(savedComment);

    // 修改并保存（已加载表直接覆盖）
    await page.locator('#table-comment').fill(savedEditedComment);
    await page.getByRole('button', { name: /保存当前表/i }).click();
    // 已加载表直接保存，不弹对话框
    await page.waitForTimeout(500);

    // 切换到草稿，应显示草稿注释
    await clickFirstDraft(page);
    await expect(page.locator('#table-comment')).toHaveValue(globalDraftComment);

    // 再次加载保存的表，应显示更新后的注释
    await clickSidebarTable(page, new RegExp(tableName, 'i'));
    await expect(page.locator('#table-comment')).toHaveValue(savedEditedComment);
  });

  test('场景：重命名应保留已保存版本，删除后可重新保存', async ({ page }) => {
    const originalName = `e2e_draft_lifecycle_${Date.now()}`;
    const renamedName = `${originalName}_renamed`;
    const initialSavedComment = 'initial_saved_comment';
    const freshSavedComment = 'fresh_saved_after_delete';
    const globalComment = 'global_after_lifecycle';

    // 保存表
    await page.locator('#table-name').fill(originalName);
    await page.locator('#table-comment').fill(initialSavedComment);
    await fillBasicField(page, 'draft_lifecycle_id');
    await page.getByRole('button', { name: /保存当前表/i }).click();
    await expect(page.getByRole('heading', { name: /保存当前表|更新保存的表/i })).toBeVisible();
    await page.getByLabel('保存名称').fill(originalName);
    await page.getByRole('button', { name: /^保存$/ }).click();
    await expect(page.getByRole('heading', { name: /保存当前表|更新保存的表/i })).toBeHidden();

    // 重命名
    await sidebarTableAction(page, new RegExp(originalName, 'i'), /重命名/);
    await expect(page.getByText('重命名保存的表')).toBeVisible();
    await page.getByLabel('新名称').fill(renamedName);
    await page.getByRole('button', { name: /确认/i }).click();
    await expect(page.getByText('重命名保存的表')).toBeHidden();

    // 切换到草稿并修改
    await clickFirstDraft(page);
    await page.locator('#table-comment').fill(globalComment);
    // 等待草稿持久化
    await page.waitForTimeout(700);

    // 加载重命名后的表，应显示原始注释
    await clickSidebarTable(page, new RegExp(renamedName, 'i'));
    await expect(page.locator('#table-comment')).toHaveValue(initialSavedComment);

    // 删除表
    await sidebarTableAction(page, new RegExp(renamedName, 'i'), /删除/);
    const deleteConfirmDialog = page.getByRole('dialog').filter({ hasText: /移入回收站/ });
    await expect(deleteConfirmDialog).toBeVisible();
    await deleteConfirmDialog.getByRole('button', { name: /移入回收站/i }).click();
    await expect(deleteConfirmDialog).toBeHidden();

    // 重新保存同名表
    await clickFirstDraft(page);
    await saveNewTable(page, renamedName, freshSavedComment);

    // 加载并验证
    await clickSidebarTable(page, new RegExp(renamedName, 'i'));
    await expect(page.locator('#table-comment')).toHaveValue(freshSavedComment);
  });
});
