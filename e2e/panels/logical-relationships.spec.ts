import { test, expect } from '@playwright/test';
import { openTableAction, selectWorkspaceView, setupHydratedState } from '../utils';

test('Logical relationships persist without adding SQL constraints @panels', async ({ page }) => {
  await page.goto('/');
  await setupHydratedState(page);
  const parentRow = page.locator('[data-testid="data-table"] tbody tr').nth(1);
  const nameCell = parentRow.locator('td[data-column-id="fieldName"]');
  await nameCell.dblclick();
  await nameCell.locator('input').fill('parent_id');
  await nameCell.locator('input').press('Enter');
  const typeCell = parentRow.locator('td[data-column-id="fieldType"]');
  await typeCell.dblclick();
  await typeCell.locator('input').fill('INT');
  await typeCell.locator('input').press('Enter');
  await page.getByRole('button', { name: /保存当前表/ }).click();
  await page.getByLabel('保存名称').fill('Business links');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByLabel('保存名称')).toBeHidden();
  await openTableAction(page, 'ER 关系图');
  const diagram = page.getByRole('dialog', { name: 'ER 关系图' });
  const node = diagram.locator('.react-flow__node').filter({ hasText: 'HYDRATION_CHECK' });
  await node
    .locator('.react-flow__handle.source[data-handleid="parent_id"]')
    .dragTo(node.locator('.react-flow__handle.target[data-handleid="HYDRATED_FIELD"]'));
  const wizard = page
    .getByRole('dialog')
    .filter({ has: page.getByRole('button', { name: '创建关系', exact: true }) });
  await wizard.getByRole('button', { name: '逻辑关系', exact: true }).click();
  await wizard.getByLabel('业务说明').fill('业务上的自关联');
  await wizard.getByRole('button', { name: '创建关系', exact: true }).click();
  await expect(wizard).toBeHidden();
  await expect(diagram.getByText(/逻辑关系 · N:1/)).toBeVisible();
  await expect(diagram.locator('.react-flow__edge path.react-flow__edge-path')).toHaveCSS(
    'stroke-dasharray',
    '6px, 4px',
  );
  await page.keyboard.press('Escape');
  await page.reload();
  await page.getByRole('button', { name: 'Business links', exact: true }).first().click();
  await selectWorkspaceView(page, 'split');
  await page.getByRole('tab', { name: '外键配置', exact: true }).click();
  await expect(page.getByText('业务上的自关联', { exact: true })).toBeVisible();
  await expect(page.locator('[role="tabpanel"]:visible pre')).not.toContainText('FOREIGN KEY');
});
