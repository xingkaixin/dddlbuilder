import { test, expect, type Locator } from '@playwright/test';
import { setupHydratedState } from '../utils';

async function expectStatusEnum(dialog: Locator) {
  await expect(dialog.getByPlaceholder('枚举值', { exact: true })).toHaveValue('1');
  await expect(dialog.getByPlaceholder('中文注释')).toHaveValue('启用');
  await expect(dialog.getByPlaceholder('英文注释')).toHaveValue('Active');
  await expect(dialog.getByRole('button', { name: '选择颜色' })).toHaveCSS(
    'background-color',
    'rgb(59, 130, 246)',
  );
}

test('字段模板保存、编辑和应用保留逻辑枚举 @fields', async ({ page }) => {
  await page.goto('/');
  await setupHydratedState(page);
  const rows = page.getByTestId('data-table').locator('tbody tr');
  const initialRowCount = await rows.count();
  await rows.first().getByRole('button', { name: '编辑枚举值', exact: true }).last().click();
  const enumDialog = page.getByRole('dialog', { name: /编辑枚举值/ });
  await enumDialog.getByPlaceholder('输入新枚举值，回车确认').fill('1');
  await enumDialog.getByPlaceholder('输入新枚举值，回车确认').press('Enter');
  await enumDialog.getByPlaceholder('中文注释').fill('启用');
  await enumDialog.getByPlaceholder('英文注释').fill('Active');
  await enumDialog.getByRole('button', { name: '选择颜色' }).click();
  await page.getByRole('button', { name: '#3b82f6', exact: true }).click();
  await page.keyboard.press('Escape');
  await enumDialog.getByRole('button', { name: '确定', exact: true }).click();
  await expect(enumDialog).toBeHidden();

  const templatesButton = page.getByRole('button', { name: /应用\s*模板/i });
  await templatesButton.click();
  await page.getByRole('button', { name: /将当前行保存为模板/ }).click();
  const saveDialog = page.getByRole('dialog', { name: '保存为模板', exact: true });
  await saveDialog.getByLabel('模板名称').fill('枚举状态模板');
  await saveDialog.getByRole('button', { name: '创建模板', exact: true }).click();
  await expect(saveDialog).toBeHidden();

  await templatesButton.click();
  await page.getByRole('button', { name: '管理模板...' }).click();
  await page.getByRole('button', { name: '编辑模板 枚举状态模板', exact: true }).click();
  const editor = page.getByRole('dialog', { name: '编辑模板', exact: true });
  await editor.getByRole('button', { name: '编辑枚举值', exact: true }).last().click();
  await expectStatusEnum(enumDialog);
  await enumDialog.getByRole('button', { name: '取消', exact: true }).click();
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await expect(editor).toBeHidden();
  await page
    .getByRole('dialog')
    .filter({ has: page.getByRole('heading', { name: '字段模板管理', exact: true }) })
    .getByRole('button', { name: '关闭', exact: true })
    .click();

  await templatesButton.click();
  await page.getByRole('button', { name: /枚举状态模板.*1 个字段/ }).click();
  await expect(rows).toHaveCount(initialRowCount + 1);
  await rows.nth(1).getByRole('button', { name: '编辑枚举值', exact: true }).last().click();
  await expectStatusEnum(enumDialog);
});
