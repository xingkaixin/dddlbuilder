import { test, expect } from '@playwright/test';

test.describe('权限管理验证 @panels', () => {
  test.beforeEach(async ({ context, page }) => {
    await context.addInitScript(() => {
      window.localStorage.setItem(
        'ddlbuilder:fireworks:cny:shown:2026:v1',
        'true',
      );
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: async () => {} },
        configurable: true,
      });
    });
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/');
    await page.locator('#table-name').fill('perm_test');

    // 添加一个字段
    const cell = page.locator(
      '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(2)',
    );
    await cell.dblclick();
    await page.locator('[data-testid="data-table"] input').fill('id');
    await page.keyboard.press('Enter');
  });

  test('场景：为用户授予权限并验证 DCL', async ({ page }) => {
    // 切换到“授权配置”面板
    await page.getByRole('tab', { name: /授权配置/i }).click();

    // 输入授权对象
    const authInput = page.getByPlaceholder(/输入授权对象名称/i);
    await authInput.fill('admin_role');
    await page.keyboard.press('Enter');

    // 检查 DDL 生成面板中是否包含 DCL (或者检查 DCL 输出区域)
    // 根据 useSqlGeneration.ts，生成的 DCL 在 generatedDcl 中
    // 在 UI 中，DDLOutput 可能有切换 DDL/DCL 的 Tab
    const dclTab = page.getByRole('tab', { name: /授权 DCL/i });
    if (await dclTab.isVisible()) {
      await dclTab.click();
      const dclOutput = page.locator('[data-state="active"] pre');
      await expect(dclOutput).toContainText(
        /GRANT SELECT ON perm_test TO admin_role/i,
      );
    } else {
      // 如果没有特定 Tab，可能就在同一个面板下
      const sqlOutput = page.locator('[data-state="active"] pre');
      await expect(sqlOutput).toContainText(
        /GRANT SELECT ON perm_test TO admin_role/i,
      );
    }
  });

  test('场景：复制 DCL', async ({ page }) => {
    await page.getByRole('tab', { name: /授权配置/i }).click();
    const authInput = page.getByPlaceholder(/输入授权对象名称/i);
    await authInput.fill('copy_role');
    await page.keyboard.press('Enter');

    await page.getByRole('tab', { name: /授权 DCL/i }).click();
    await page.evaluate(() => {
      (window as any).__copyTriggered = false;
      const writeText = async () => {
        (window as any).__copyTriggered = true;
      };
      try {
        Object.defineProperty(navigator, 'clipboard', {
          value: { writeText },
          configurable: true,
        });
      } catch {
        (navigator as any).clipboard = { writeText };
      }
    });
    const copyButton = page.getByRole('button', { name: /复制DCL/i });
    await copyButton.click();
    await expect
      .poll(() => page.evaluate(() => (window as any).__copyTriggered))
      .toBe(true);
  });
});
