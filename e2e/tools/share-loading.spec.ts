import { selectWorkspaceView } from '../utils';
import { test, expect } from '@playwright/test';

const SHARE_ID = '8c6afce1-2a39-47aa-a14f-f3450c3ad7dd';

test('含非法枚举元数据的旧分享仍能显示字段和 DDL @tools', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route(`**/api/share/${SHARE_ID}`, (route) =>
    route.fulfill({
      json: {
        id: SHARE_ID,
        state: {
          dbType: 'mysql',
          tableName: 'shared_status',
          tableComment: '',
          addCount: 10,
          indexInput: '',
          currentIndexFields: [],
          authInput: '',
          authObjects: [],
          indexes: [],
          rows: [
            {
              fieldName: 'status',
              fieldType: 'INT',
              fieldComment: '',
              nullable: false,
              enumMeta: [null, { value: {} }, { value: '1', i18n: { 'zh-CN': '启用' } }],
            },
          ],
        },
      },
    }),
  );
  await page.goto(`/share/${SHARE_ID}`);
  await expect(page.getByLabel('表名', { exact: true })).toHaveValue('shared_status');
  await expect(page.locator('[role="tabpanel"]:visible pre')).toContainText('枚举: 1(启用)');
  await selectWorkspaceView(page, 'split');
  await expect(page.getByTestId('data-table').getByText('status', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
