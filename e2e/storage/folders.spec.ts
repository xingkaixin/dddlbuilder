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

const saveTable = async (page: any, name: string) => {
  await page.locator('#table-name').fill(name);
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
  await page.getByRole('button', { name: /查看已保存表/i }).click();
  await expect(page.getByRole('heading', { name: '已保存的表' })).toBeVisible();
};

test.describe('文件夹管理验证 @storage', () => {
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

  test('场景：创建文件夹并归类表', async ({ page }) => {
    await openSavedTables(page);

    // 点击“新建文件夹”图标
    await page.getByRole('button', { name: /新建文件夹/i }).click();
    await page.getByLabel('文件夹名称').fill('MyProject');
    await page.getByRole('button', { name: /确定/i }).click();

    await expect(page.getByText('MyProject')).toBeVisible();

    // (可选) 拖拽表到文件夹的操作在 E2E 中比较复杂，暂不实现
  });

  test('场景：重命名文件夹', async ({ page }) => {
    await saveTable(page, `folder_stub_${Date.now()}`);
    await openSavedTables(page);

    await page.getByRole('button', { name: /新建文件夹/i }).click();
    await page.getByLabel('文件夹名称').fill('FolderA');
    await page.getByRole('button', { name: /确定/i }).click();

    const folderButton = page.getByRole('button', { name: /FolderA/i });
    await folderButton.hover();
    await folderButton.locator('..').getByRole('button').last().click();
    await page.getByRole('menuitem', { name: /重命名/i }).click();

    await page.getByLabel('文件夹名称').fill('FolderB');
    await page.getByRole('button', { name: /确定/i }).click();

    await expect(page.getByRole('button', { name: /FolderB/i })).toBeVisible();
    await expect(page.getByText('FolderA')).toHaveCount(0);
  });

  test('场景：删除文件夹', async ({ page }) => {
    await saveTable(page, `folder_stub_${Date.now()}`);
    await openSavedTables(page);

    await page.getByRole('button', { name: /新建文件夹/i }).click();
    await page.getByLabel('文件夹名称').fill('DeleteFolder');
    await page.getByRole('button', { name: /确定/i }).click();

    const folderButton = page.getByRole('button', { name: /DeleteFolder/i });
    await folderButton.hover();
    await folderButton.locator('..').getByRole('button').last().click();
    await page.getByRole('menuitem', { name: /删除/i }).click();

    await expect(
      page.getByRole('heading', { name: '删除文件夹' }),
    ).toBeVisible();
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

    const tableRow = page.getByRole('button', {
      name: new RegExp(tableName, 'i'),
    });
    await tableRow.hover();
    await tableRow
      .locator('..')
      .getByRole('button', { name: /移动到文件夹/i })
      .click();
    await page.getByRole('menuitem', { name: /Group1/i }).click();

    const folderButton = page.getByRole('button', { name: /Group1/i });
    await folderButton
      .locator('..')
      .getByRole('button', { name: /展开/i })
      .click();
    await expect(
      page.getByRole('button', { name: new RegExp(tableName, 'i') }),
    ).toBeVisible();

    const movedRow = page.getByRole('button', {
      name: new RegExp(tableName, 'i'),
    });
    await movedRow.hover();
    await movedRow
      .locator('..')
      .getByRole('button', { name: /移动到文件夹/i })
      .click();
    await page.getByRole('menuitem', { name: /移到根目录/i }).click();

    await expect(
      page.getByRole('button', { name: new RegExp(tableName, 'i') }),
    ).toBeVisible();
  });
});
