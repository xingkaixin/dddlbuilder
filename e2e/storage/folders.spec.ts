import { test, expect } from '@playwright/test';
import { ensureBuilderVisible } from '../utils';

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

const saveTable = async (page: any, name: string) => {
  await page.locator('#table-name').fill(name);
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

const openSavedTables = async (page: any) => {
  const heading = page.getByRole('heading', { name: '工作区' });
  if (await heading.isVisible().catch(() => false)) {
    return;
  }
  await page.getByRole('button', { name: '工作区' }).click();
  await expect(heading).toBeVisible();
};

const dragToTarget = async (page: any, source: any, target: any) => {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await expect(source).toBeVisible();
      await expect(target).toBeVisible();
      const sourceBox = await source.boundingBox();
      const targetBox = await target.boundingBox();
      if (!sourceBox || !targetBox) {
        throw new Error('拖拽元素定位失败');
      }

      await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, {
        steps: 12,
      });
      await page.mouse.up();
      return;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(120);
    }
  }

  throw lastError;
};

const getDrawer = (page: any) => page.getByRole('dialog', { name: /工作区/i });

const getTableRowByName = (page: any, name: RegExp) => {
  const drawer = getDrawer(page);
  return drawer.locator('[data-testid^="saved-table-row:"]').filter({ hasText: name }).first();
};

const getFolderRowByName = (page: any, name: RegExp) => {
  const drawer = getDrawer(page);
  return drawer.locator('[data-testid^="folder-row:"]').filter({ hasText: name }).first();
};

const ensureFolderExpanded = async (page: any, folderName: string) => {
  const expandButton = page
    .getByRole('button', {
      name: new RegExp(`展开\\s*${folderName}`, 'i'),
    })
    .first();
  if (await expandButton.isVisible().catch(() => false)) {
    await expandButton.click({ force: true });
  }
};

const getLeftX = async (locator: any) => {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return box?.x ?? 0;
};

test.describe('文件夹管理验证 @storage', () => {
  test.beforeEach(async ({ context, page }) => {
    await context.addInitScript(() => {
      indexedDB.deleteDatabase('ddlbuilder');
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto('/');
    await ensureBuilderVisible(page);
  });

  test('场景：创建文件夹并归类表', async ({ page }) => {
    await openSavedTables(page);

    // 点击“新建文件夹”图标
    await page.getByRole('button', { name: /新建文件夹/i }).click();
    await page.getByLabel('文件夹名称').fill('MyProject');
    await page.getByRole('button', { name: /确定/i }).click();

    await expect(page.getByRole('button', { name: /MyProject/i })).toBeVisible();
  });

  test('场景：根级文件夹与根级表图标应对齐', async ({ page }) => {
    const tableNameA = `align_root_a_${Date.now()}`;
    const tableNameB = `align_root_b_${Date.now()}`;

    await saveTable(page, tableNameA);

    await page.getByRole('button', { name: /清空/i }).click();
    await page.getByRole('button', { name: /确认清空/i }).click();
    await expect(page.locator('#table-name')).toHaveValue('');

    await saveTable(page, tableNameB);
    await openSavedTables(page);

    await page.getByRole('button', { name: /新建文件夹/i }).click();
    await page.getByLabel('文件夹名称').fill('AlignFolder');
    await page.getByRole('button', { name: /确定/i }).click();

    const drawer = getDrawer(page);
    const folderRow = getFolderRowByName(page, /AlignFolder/i);
    const folderIcon = folderRow.locator('button').nth(2).locator('svg').first();
    const tableIconA = drawer.getByTestId(`table-icon:${tableNameA}`).first();
    const tableIconB = drawer.getByTestId(`table-icon:${tableNameB}`).first();

    const folderIconX = await getLeftX(folderIcon);
    const tableIconAX = await getLeftX(tableIconA);
    const tableIconBX = await getLeftX(tableIconB);

    expect(Math.abs(tableIconAX - folderIconX)).toBeLessThanOrEqual(2);
    expect(Math.abs(tableIconBX - folderIconX)).toBeLessThanOrEqual(2);
  });

  test('场景：重命名文件夹', async ({ page }) => {
    await saveTable(page, `folder_stub_${Date.now()}`);
    await openSavedTables(page);

    await page.getByRole('button', { name: /新建文件夹/i }).click();
    await page.getByLabel('文件夹名称').fill('FolderA');
    await page.getByRole('button', { name: /确定/i }).click();

    const folderRow = getFolderRowByName(page, /FolderA/i);
    await folderRow.hover();
    await folderRow.locator('button').last().click();
    await page.getByRole('menuitem', { name: /重命名/i }).click();

    await page.getByLabel('文件夹名称').fill('FolderB');
    await page.getByRole('button', { name: /确定/i }).click();

    const drawerAfter = getDrawer(page);
    await expect(drawerAfter.getByRole('button', { name: /FolderB/i }).first()).toBeVisible();
    await expect(drawerAfter.getByText('FolderA')).toHaveCount(0);
  });

  test('场景：删除文件夹', async ({ page }) => {
    await saveTable(page, `folder_stub_${Date.now()}`);
    await openSavedTables(page);

    await page.getByRole('button', { name: /新建文件夹/i }).click();
    await page.getByLabel('文件夹名称').fill('DeleteFolder');
    await page.getByRole('button', { name: /确定/i }).click();

    const folderRow = getFolderRowByName(page, /DeleteFolder/i);
    await folderRow.hover();
    await folderRow.locator('button').last().click();
    await page.getByRole('menuitem', { name: /删除/i }).click();

    await expect(page.getByRole('heading', { name: '删除文件夹' })).toBeVisible();
    await page.getByRole('button', { name: /确定删除/i }).click();

    await expect(page.getByText('DeleteFolder')).toHaveCount(0);
  });

  test('场景：移动表到文件夹并移出', async ({ page }) => {
    const tableName = `folder_table_${Date.now()}`;
    await saveTable(page, tableName);

    await openSavedTables(page);

    await page.getByRole('button', { name: /新建文件夹/i }).click();
    await page.getByLabel('文件夹名称').fill('Group1');
    await page.getByRole('button', { name: /确定/i }).click();

    const tableRow = getTableRowByName(page, new RegExp(tableName, 'i'));
    const tableHandle = tableRow.getByRole('button', { name: /拖拽移动表/i });
    const groupRow = getFolderRowByName(page, /Group1/i);
    await dragToTarget(page, tableHandle, groupRow);

    await ensureFolderExpanded(page, 'Group1');
    await expect(getTableRowByName(page, new RegExp(tableName, 'i'))).toBeVisible();

    const movedRow = getTableRowByName(page, new RegExp(tableName, 'i'));
    const movedHandle = movedRow.getByRole('button', { name: /拖拽移动表/i });
    await dragToTarget(page, movedHandle, page.getByTestId('root-dropzone'));

    await expect(getTableRowByName(page, new RegExp(tableName, 'i'))).toBeVisible();
  });

  test('场景：文件夹拖拽到另一文件夹下', async ({ page }) => {
    await openSavedTables(page);

    await page.getByRole('button', { name: /新建文件夹/i }).click();
    await page.getByLabel('文件夹名称').fill('FolderParentA');
    await page.getByRole('button', { name: /确定/i }).click();

    await page.getByRole('button', { name: /新建文件夹/i }).click();
    await page.getByLabel('文件夹名称').fill('FolderParentB');
    await page.getByRole('button', { name: /确定/i }).click();

    const folderARow = getFolderRowByName(page, /FolderParentA/i);
    const folderAHandle = folderARow.getByRole('button', {
      name: /拖拽移动文件夹/i,
    });
    const folderBRow = getFolderRowByName(page, /FolderParentB/i);
    await dragToTarget(page, folderAHandle, folderBRow);

    await ensureFolderExpanded(page, 'FolderParentB');
    await expect(page.getByRole('button', { name: /FolderParentA/i })).toBeVisible();
  });

  test('场景：移动包含表的文件夹后，表随文件夹一起移动', async ({ page }) => {
    const tableName = `folder_with_table_${Date.now()}`;
    await saveTable(page, tableName);
    await openSavedTables(page);

    await page.getByRole('button', { name: /新建文件夹/i }).click();
    await page.getByLabel('文件夹名称').fill('SourceFolder');
    await page.getByRole('button', { name: /确定/i }).click();

    await page.getByRole('button', { name: /新建文件夹/i }).click();
    await page.getByLabel('文件夹名称').fill('TargetFolder');
    await page.getByRole('button', { name: /确定/i }).click();

    const tableRow = getTableRowByName(page, new RegExp(tableName, 'i'));
    const tableHandle = tableRow.getByRole('button', { name: /拖拽移动表/i });
    const sourceFolderRow = getFolderRowByName(page, /SourceFolder/i);
    await dragToTarget(page, tableHandle, sourceFolderRow);

    const sourceHandle = getFolderRowByName(page, /SourceFolder/i).getByRole('button', {
      name: /拖拽移动文件夹/i,
    });
    const targetFolderRow = getFolderRowByName(page, /TargetFolder/i);
    await dragToTarget(page, sourceHandle, targetFolderRow);

    await ensureFolderExpanded(page, 'TargetFolder');
    await ensureFolderExpanded(page, 'SourceFolder');

    await expect(getTableRowByName(page, new RegExp(tableName, 'i'))).toBeVisible();
  });
});
