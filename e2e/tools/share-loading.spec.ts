import { test, expect } from '@playwright/test';

const SHARE_ID = '8c6afce1-2a39-47aa-a14f-f3450c3ad7dd';

for (const initialStatus of [200, 502]) {
  test(`分享读取首次返回 ${initialStatus} 后显示共享表结构 @tools`, async ({ page }) => {
    let attempts = 0;
    await page.route(`**/api/share/${SHARE_ID}`, async (route) => {
      attempts += 1;
      if (initialStatus === 502 && attempts === 1) {
        await route.fulfill({
          status: 502,
          json: { error: 'Share read failed', code: 'SHARE_LOAD_FAILED' },
        });
        return;
      }
      await route.fulfill({
        json: {
          id: SHARE_ID,
          state: {
            dbType: 'mysql',
            tableName: 'shared_orders',
            tableComment: '',
            schemaName: '',
            sqlFormatMode: 'compact',
            addCount: 10,
            indexInput: '',
            currentIndexFields: [],
            authInput: '',
            authObjects: [],
            rows: [
              {
                id: 'order-id',
                fieldName: 'order_id',
                fieldType: 'INT',
                fieldComment: '',
                nullable: false,
              },
            ],
            indexes: [],
          },
        },
      });
    });

    await page.goto(`/share/${SHARE_ID}`);
    await expect(page.getByLabel('表名', { exact: true })).toHaveValue('shared_orders');
    console.info('Share retry browser result', {
      attempts,
      url: page.url(),
      tableName: await page.getByLabel('表名', { exact: true }).inputValue(),
    });
    await expect(page).toHaveURL(new RegExp(`/share/${SHARE_ID}$`));
    await expect(page.locator('[role="tabpanel"]:visible pre')).toContainText('order_id');
    await expect(page.getByText('分享链接不存在或已过期，已返回首页')).toHaveCount(0);
    expect(attempts).toBe(initialStatus === 502 ? 2 : 1);
  });
}

for (const { status, code, attempts: expectedAttempts, message } of [
  {
    status: 404,
    code: 'SHARE_NOT_FOUND',
    attempts: 1,
    message: '分享链接不存在或已过期，已返回首页',
  },
  { status: 502, code: 'SHARE_LOAD_FAILED', attempts: 2, message: '分享链接加载失败，已返回首页' },
]) {
  test(`分享读取返回 ${status} 时显示对应错误 @tools`, async ({ page }) => {
    let attempts = 0;
    await page.route(`**/api/share/${SHARE_ID}`, async (route) => {
      attempts += 1;
      await route.fulfill({ status, json: { error: 'Share unavailable', code } });
    });

    await page.goto(`/share/${SHARE_ID}`);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText(message)).toBeVisible();
    expect(attempts).toBe(expectedAttempts);
  });
}
