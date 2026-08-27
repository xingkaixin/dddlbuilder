import { test, expect } from '@playwright/test';
import { setupHydratedState } from '../utils';

test('Oracle foreign keys only offer supported actions and produce valid clauses @panels', async ({
  page,
}) => {
  await page.goto('/');
  await setupHydratedState(page);
  await page.getByTestId('db-type-selector').click();
  await page.getByRole('option', { name: 'Oracle', exact: true }).click();
  await page.getByText('外键配置', { exact: true }).click();
  await page.getByRole('button', { name: '添加外键', exact: true }).click();

  const onDelete = page.getByLabel('删除时', { exact: true });
  const onUpdate = page.getByLabel('更新时', { exact: true });
  await expect(onDelete.locator('option')).toHaveText(['无动作', 'CASCADE', 'SET NULL']);
  await expect(onUpdate.locator('option')).toHaveText(['无动作']);
  await page.getByPlaceholder('例如: fk_user_id').fill('fk_user');
  await page.getByPlaceholder('例如: users').fill('users');
  await page.getByRole('button', { name: 'HYDRATED_FIELD', exact: true }).click();
  await page.getByPlaceholder('输入字段名，回车添加').fill('id');
  await page.getByPlaceholder('输入字段名，回车添加').press('Enter');
  await onDelete.selectOption('CASCADE');
  await page.getByRole('button', { name: '确认添加', exact: true }).click();

  const sql = page.locator('[role="tabpanel"]:visible pre');
  await expect(sql).toContainText(
    'FOREIGN KEY (HYDRATED_FIELD) REFERENCES users (id) ON DELETE CASCADE;',
  );
  await expect(sql).not.toContainText('ON UPDATE');
  await expect(sql).not.toContainText('Manual migration required');
});
