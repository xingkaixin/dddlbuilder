import { openTableAction } from '../utils';
import { test, expect } from '@playwright/test';
import { setupHydratedState } from '../utils';
import type { PersistedState } from '../../packages/shared-types/src/index';

test.describe('核心 UI 交互功能测试 @core', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await setupHydratedState(page);
  });

  test('场景：清空所有功能应重置表单并继续保存编辑', async ({ page }) => {
    // 填写一些数据
    await page.locator('#table-name').fill('to_be_cleared');
    await page.locator('#table-comment').fill('即将被清空的表');

    // 填写字段
    const firstFieldNameCell = page.locator(
      '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(2)',
    );
    await firstFieldNameCell.dblclick();
    await page
      .locator('[data-testid="data-table"] input:not([aria-hidden="true"])')
      .fill('field_to_clear');
    await page.keyboard.press('Enter');

    // 验证数据已填写
    await expect(page.locator('#table-name')).toHaveValue('to_be_cleared');
    await expect(firstFieldNameCell).toHaveText('field_to_clear');

    // 点击清空按钮
    await openTableAction(page, /清空/i);

    // 确认对话框应该出现
    const confirmDialog = page.getByText(/确认清空所有配置？/i);
    await expect(confirmDialog).toBeVisible();

    // 取消清空
    await page.getByRole('button', { name: /取消/i }).click();
    await expect(confirmDialog).not.toBeVisible();

    // 验证数据还在
    await expect(page.locator('#table-name')).toHaveValue('to_be_cleared');

    // 再次点击清空并确认
    await openTableAction(page, /清空/i);
    await page.getByRole('button', { name: /确认清空/i }).click();

    // 验证数据已被清空
    await expect(page.locator('#table-name')).toHaveValue('');

    await page.locator('#table-name').fill('work_after_clear');
    await page.locator('#table-comment').fill('清空后继续编辑');
    // IndexedDB writes are asynchronous; verify the draft is durable before reloading.
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('ddlbuilder');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });

          try {
            return await new Promise<PersistedState[]>((resolve, reject) => {
              const request = db
                .transaction('workspace_global_draft', 'readonly')
                .objectStore('workspace_global_draft')
                .getAll();
              request.onsuccess = () =>
                resolve(request.result.map((record: { state: PersistedState }) => record.state));
              request.onerror = () => reject(request.error);
            });
          } finally {
            db.close();
          }
        }),
      )
      .toContainEqual(
        expect.objectContaining({ tableName: 'work_after_clear', tableComment: '清空后继续编辑' }),
      );
    await page.reload();
    await page
      .getByTestId('workspace-content')
      .getByRole('button', { name: /work_after_clear/ })
      .click();
    await expect(page.locator('#table-name')).toHaveValue('work_after_clear');
    await expect(page.locator('#table-comment')).toHaveValue('清空后继续编辑');
  });
});
