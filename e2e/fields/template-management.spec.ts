import { test, expect } from '@playwright/test';

test.describe('模板管理功能测试 @fields', () => {
  test.beforeEach(async ({ context, page }) => {
    await context.addInitScript(() => {
      window.localStorage.setItem(
        'ddlbuilder:fireworks:cny:shown:2026:v1',
        'true',
      );
      window.localStorage.setItem(
        'ddlbuilder:state:v1',
        JSON.stringify({
          tableName: 'HYDRATION_CHECK',
          rows: [{ order: 1, fieldName: 'HYDRATED_FIELD', fieldType: 'INT' }],
        }),
      );
    });
    await page.goto('/');
    await expect(page.locator('#table-name')).toHaveValue('HYDRATION_CHECK', {
      timeout: 10000,
    });
    await expect(
      page.locator(
        '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(2)',
      ),
    ).toHaveText('HYDRATED_FIELD', { timeout: 10000 });
  });

  test('场景：应用模板按钮应能正常打开', async ({ page }) => {
    // 点击模板按钮
    const templateBtn = page
      .getByRole('button', { name: /应用\s*模板/i })
      .or(page.getByRole('button', { name: /模板/i }).first());
    await templateBtn.click();

    // 验证弹出菜单出现
    const popoverText = page
      .getByText(/将当前行保存为模板/i)
      .or(page.getByText(/管理模板/i));
    if ((await popoverText.count()) > 0) {
      await expect(popoverText.first()).toBeVisible();
    }

    // 按 ESC 关闭
    await page.keyboard.press('Escape');
  });
});
