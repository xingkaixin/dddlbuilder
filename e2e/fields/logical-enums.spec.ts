import { test, expect } from '@playwright/test';
import { setupHydratedState } from '../utils';

test('枚举编辑按钮与弹窗操作不触发字段类型编辑 @fields', async ({ page }) => {
  await page.goto('/');
  await setupHydratedState(page);
  const row = page.getByTestId('data-table').locator('tbody tr').first();
  const enumDialog = page.getByRole('dialog', { name: /编辑枚举值/ });
  await row.getByRole('button', { name: '编辑枚举值', exact: true }).last().click();
  console.info('Enum editor after pencil click', {
    dialogs: await enumDialog.count(),
    fieldTypeInputs: await row.getByPlaceholder('字段类型', { exact: true }).count(),
  });
  await expect(enumDialog).toBeVisible();
  await enumDialog.getByPlaceholder('输入新枚举值，回车确认').fill('1');
  await enumDialog.getByRole('button', { name: '添加', exact: true }).click();
  await enumDialog.getByRole('button', { name: '选择颜色', exact: true }).click();
  await page.getByRole('button', { name: '#3b82f6', exact: true }).click();
  await page.keyboard.press('Escape');
  await enumDialog.getByRole('button', { name: '确定', exact: true }).click();
  await expect(enumDialog).toBeHidden();
  await expect(row.locator('[title="1"]')).toHaveCSS('background-color', 'rgb(59, 130, 246)');
});
