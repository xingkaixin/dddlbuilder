import { test, expect } from '@playwright/test';

test.describe('分享功能验证 @tools @smoke', () => {
  test.beforeEach(async ({ context, page }) => {
    await context.addInitScript(() => {
      window.localStorage.setItem('fireworks_shown_2026', 'true');
      window.localStorage.setItem('ddlbuilder:state:v1', JSON.stringify({ 
        tableName: 'HYDRATION_CHECK',
        rows: [{ order: 1, fieldName: 'HYDRATED_FIELD', fieldType: 'INT' }] 
      }));
    });
    await page.goto('/');
    await expect(page.locator('#table-name')).toHaveValue('HYDRATION_CHECK', { timeout: 10000 });
  });

  test('场景：生成分享链接并保存到剪贴板', async ({ page, context }) => {
    await page.locator('#table-name').fill('share_test');
    
    // 给权限让 Playwright 访问剪贴板
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    // 点击分享按钮
    await page.getByRole('button', { name: /分享/i }).click();

    // 验证 Toast 提示
    await expect(page.getByText(/链接已复制/i)).toBeVisible();

    // 验证剪贴板内容包含 ?s=
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toContain('?s=');
  });
});
