import { test, expect } from '@playwright/test';

test.describe('分享功能验证 @tools @smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#table-name')).toBeVisible({ timeout: 10000 });
  });

  test('场景：生成分享链接并保存到剪贴板', async ({ page, context }) => {
    const fakeShareId = '8c6afce1-2a39-47aa-a14f-f3450c3ad7dd';
    let createShareRequestCount = 0;
    await page.route('**/api/share', async (route) => {
      createShareRequestCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: fakeShareId,
          url: `http://127.0.0.1:5173/share/${fakeShareId}`,
          expiresInSeconds: 604800,
        }),
      });
    });

    await page.locator('#table-name').fill('share_test');

    // 给权限让 Playwright 访问剪贴板
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    // 双击分享按钮，验证并发防重入仅触发一次请求
    await page.getByRole('button', { name: /分享/i }).dblclick();
    await expect(page.getByRole('button', { name: /生成中/i })).toBeDisabled();
    expect(createShareRequestCount).toBe(1);

    // 验证 Toast 提示（包含有效期）
    await expect(page.getByText(/链接已复制到剪贴板/i)).toBeVisible();
    await expect(page.getByText(/7天后失效/i)).toBeVisible();

    // 验证剪贴板内容是短链接
    const clipboardText = await page.evaluate(() =>
      navigator.clipboard.readText(),
    );
    expect(clipboardText).toContain(`/share/${fakeShareId}`);

    // 第二次点击应复用已有链接，不再创建新的 Redis key
    await page.getByRole('button', { name: /分享/i }).click();
    await expect(page.getByText(/复用已有链接/i)).toBeVisible();
    expect(createShareRequestCount).toBe(1);
  });
});
