import { test, expect } from '@playwright/test';
import { setupHydratedState } from '../utils';

test('应用整表蓝本不继承原表外键 @fields', async ({ page }) => {
  await page.goto('/');
  await setupHydratedState(page);
  const blueprints = page.getByRole('button', { name: '整表蓝本', exact: true });
  await blueprints.click();
  await page.getByRole('button', { name: '将当前表保存为蓝本...' }).click();
  await page.getByLabel('蓝本名称', { exact: true }).fill('独立结构');
  await page.getByRole('button', { name: '保存蓝本', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '保存为整表蓝本' })).toBeHidden();

  const fieldCell = page
    .locator('[data-testid="data-table"] tbody tr')
    .first()
    .locator('td')
    .nth(1);
  await fieldCell.dblclick();
  await page
    .locator('[data-testid="data-table"] input:not([aria-hidden="true"])')
    .fill('customer_id');
  await page.keyboard.press('Enter');
  await expect(fieldCell).toHaveText('customer_id');

  await page.getByRole('tab', { name: '外键配置', exact: true }).click();
  await page.getByRole('button', { name: '添加外键', exact: true }).click();
  await page.getByPlaceholder('例如: users').fill('customers');
  await page.getByRole('button', { name: 'customer_id', exact: true }).click();
  await page.getByPlaceholder('输入字段名，回车添加').fill('id');
  await page.getByPlaceholder('输入字段名，回车添加').press('Enter');
  await page.getByRole('button', { name: '确认添加', exact: true }).click();
  const sql = page.locator('[role="tabpanel"]:visible pre');
  await expect(sql).toContainText('FOREIGN KEY (customer_id)');

  await page.getByRole('tab', { name: '字段配置', exact: true }).click();
  await blueprints.click();
  await page.getByRole('button', { name: /独立结构/ }).click();
  await page.getByRole('button', { name: '应用蓝本', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '独立结构', exact: true })).toBeHidden();
  await expect(sql).toContainText('HYDRATED_FIELD');
  await expect(sql).not.toContainText('customer_id');
  await expect(sql).not.toContainText('FOREIGN KEY');
});
