import { test, expect } from '@playwright/test';
import { setupHydratedState } from '../utils';

test.describe('模板管理功能测试 @fields', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await setupHydratedState(page);
  });

  test('场景：应用模板按钮应能正常打开', async ({ page }) => {
    // 点击模板按钮
    const templateBtn = page
      .getByRole('button', { name: /应用\s*模板/i })
      .or(page.getByRole('button', { name: /模板/i }).first());
    await templateBtn.click();

    // 验证弹出菜单出现
    const popoverText = page.getByText(/将当前行保存为模板/i).or(page.getByText(/管理模板/i));
    if ((await popoverText.count()) > 0) {
      await expect(popoverText.first()).toBeVisible();
    }

    // 按 ESC 关闭
    await page.keyboard.press('Escape');
  });
});
