import { test, expect } from '@playwright/test';

const fillBasicField = async (page: any, name = 'id') => {
  const nameCell = page.locator(
    '.htCore tbody tr:nth-child(1) td:nth-child(2)',
  );
  await nameCell.dblclick();
  await page.locator('textarea.handsontableInput').fill(name);
  await page.keyboard.press('Enter');

  const typeCell = page.locator(
    '.htCore tbody tr:nth-child(1) td:nth-child(4)',
  );
  await typeCell.dblclick();
  await page.locator('textarea.handsontableInput').fill('int');
  await page.keyboard.press('Enter');
};

test.describe('变更对比验证 @storage', () => {
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

  test('场景：打开变更对比弹窗', async ({ page }) => {
    const tableName = `diff_test_${Date.now()}`;
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

    const typeCell = page.locator(
      '.htCore tbody tr:nth-child(1) td:nth-child(4)',
    );
    await typeCell.dblclick();
    await page.locator('textarea.handsontableInput').fill('varchar(20)');
    await page.keyboard.press('Enter');

    await page.getByRole('button', { name: /查看变更/i }).click();
    await expect(
      page.getByRole('heading', { name: /表结构变更对比/i }),
    ).toBeVisible();
    await expect(page.getByText(/字段变更/)).toBeVisible();
  });
});
