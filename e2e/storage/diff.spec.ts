import { test, expect } from '@playwright/test';
import { confirmFieldTypeChangeIfNeeded, ensureBuilderVisible } from '../utils';

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

const getSavedTableRow = (page: any, pattern: RegExp) => {
  const drawer = page.getByRole('dialog', { name: /工作区/i });
  return drawer.locator('[data-testid^="saved-table-row:"]').filter({ hasText: pattern });
};

const clickSavedTable = async (page: any, pattern: RegExp) => {
  const row = getSavedTableRow(page, pattern);
  const selectBtn = row.locator('button[data-testid^="table-select:"]').first();
  await selectBtn.click();
};

test.describe('变更对比验证 @storage', () => {
  test.beforeEach(async ({ context, page }) => {
    await context.addInitScript(() => {
      indexedDB.deleteDatabase('ddlbuilder');
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto('/');
    await ensureBuilderVisible(page);
  });

  for (const schemaOnly of [false, true]) {
    test(`场景：带 Schema 的变更对比 (schemaOnly=${schemaOnly})`, async ({ page }) => {
      const tableName = `diff_test_${Date.now()}`;
      await page.locator('#table-name').fill(tableName);
      await page.locator('#schema-name').fill('audit');
      await fillBasicField(page, 'f1');

      await page.getByRole('button', { name: /保存当前表/i }).click();
      await expect(page.getByRole('heading', { name: /保存当前表|更新保存的表/i })).toBeVisible();
      await page.getByLabel('保存名称').fill(tableName);
      await page.getByRole('button', { name: /^保存$/ }).click();
      await expect(page.getByRole('heading', { name: /保存当前表|更新保存的表/i })).toBeHidden();

      await page.getByRole('button', { name: '工作区' }).click();
      await expect(page.getByRole('heading', { name: '工作区' })).toBeVisible();
      await clickSavedTable(page, new RegExp(tableName, 'i'));
      await expect(page.getByText(new RegExp(`当前：${tableName}`))).toBeVisible();

      if (schemaOnly) {
        await page.locator('#schema-name').fill('archive');
      } else {
        const typeCell = page.locator(
          '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(4)',
        );
        await typeCell.dblclick();
        await page
          .locator('[data-testid="data-table"] input:not([aria-hidden="true"])')
          .fill('varchar(20)');
        await page.keyboard.press('Enter');
        await confirmFieldTypeChangeIfNeeded(page);
      }

      await page.getByRole('button', { name: /查看表结构变更/i }).click();
      await expect(page.getByRole('heading', { name: /表结构变更对比/i })).toBeVisible();
      const dialog = page.getByRole('dialog', { name: /表结构变更对比/i });
      if (schemaOnly) {
        await expect(dialog.getByText('Schema:')).toBeVisible();
        await expect(dialog.locator('pre').first()).toContainText(
          `RENAME TABLE audit.${tableName} TO archive.${tableName};`,
        );
      } else {
        await expect(page.getByText(/字段变更/)).toBeVisible();
        await expect(dialog.locator('pre').first()).toContainText(
          `ALTER TABLE audit.${tableName} MODIFY COLUMN`,
        );
      }
    });
  }
  for (const kind of ['view', 'partition'] as const) {
    test(`场景：识别需要手动迁移的结构变更 (${kind})`, async ({ page }) => {
      const tableName = `manual_diff_${kind}`;
      await page.locator('#table-name').fill(tableName);
      if (kind === 'view') {
        await page.locator('#object-type-select').click();
        await page.getByRole('option', { name: '视图', exact: true }).click();
        await page.locator('#view-definition').fill('SELECT id FROM users WHERE active = true');
      } else {
        await fillBasicField(page, 'id');
        await page.getByRole('tab', { name: /分区配置/ }).click();
        const panel = page.getByRole('tabpanel', { name: /分区配置/ });
        await panel.getByRole('switch').click();
        await panel.getByRole('combobox').first().click();
        await page.getByRole('option', { name: 'HASH', exact: true }).click();
        await page.getByPlaceholder(/输入表达式/).fill('id');
        await panel.getByRole('spinbutton').fill('4');
      }
      await page.getByRole('button', { name: /保存当前表|保存当前视图/ }).click();
      await page.getByLabel('保存名称').fill(tableName);
      await page.getByRole('button', { name: '保存', exact: true }).click();
      await expect(page.getByLabel('保存名称')).toBeHidden();
      if (kind === 'view') {
        await page.locator('#view-definition').fill('SELECT id FROM users WHERE active = false');
      } else {
        await page
          .getByRole('tabpanel', { name: /分区配置/ })
          .getByRole('spinbutton')
          .fill('8');
      }
      await page.getByRole('button', { name: /查看表结构变更/ }).click();
      const dialog = page.getByRole('dialog', { name: '表结构变更对比' });
      await expect(
        dialog.getByText(
          kind === 'view' ? /视图定义或结构变更.*需手动迁移/ : /表分区变更.*需手动迁移/,
        ),
      ).toBeVisible();
      await expect(dialog.locator('pre').first()).toContainText('Manual migration required');
      await expect(dialog.locator('pre').first()).toContainText('No automatic changes generated');
    });
  }
});
