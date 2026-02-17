import { test, expect } from '@playwright/test';

test.describe('字段模板应用验证 @fields', () => {
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
  });

  test('场景：应用审计字段模板', async ({ page }) => {
    // 点击“应用模板”按钮
    const templateBtn = page.getByRole('button', { name: /应用\s*模板/i });
    await expect(templateBtn).toBeVisible();
    await templateBtn.click();

    // 等待 Popover 出现
    // 检查是否有模板，如果没有则可能需要先创建一个，但通常会有内置的 (如果 Mock 了数据)
    // 假设有内置的“审计字段”
    const auditTemplate = page.getByText(/审计字段/i);
    if (await auditTemplate.isVisible()) {
      await auditTemplate.click();

      const sqlOutput = page.locator('[data-state="active"] pre');
      await expect(sqlOutput).toContainText(/created_at/i);
      await expect(sqlOutput).toContainText(/updated_at/i);
    } else {
      // 如果没有预置模板，测试“保存为模板”流程
      await page.keyboard.press('Escape');
      await expect(page.getByText(/将当前行保存为模板/i)).toBeHidden({
        timeout: 5000,
      });

      // 1. 填一个字段
      const cell = page.locator(
        '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(2)',
      );
      await expect(cell).toBeVisible();
      await cell.dblclick();
      await page.locator('[data-testid="data-table"] input').fill('custom_f1');
      await page.keyboard.press('Enter');

      await templateBtn.click();
      await page.getByText(/将当前行保存为模板/i).click();
      await expect(
        page.getByRole('heading', { name: /保存为模板/i }),
      ).toBeVisible();

      await page.getByLabel('模板名称').fill('MyCustomTemplate');
      await page.getByRole('button', { name: /创建模板/i }).click();

      // 再次打开并应用
      await templateBtn.click();
      await page.getByRole('button', { name: /MyCustomTemplate/i }).click();

      const sqlOutput = page.locator(
        '.relative.flex-1.overflow-auto.px-4.py-3\\.5 pre',
      );
      await expect(sqlOutput).toContainText(/custom_f1/i);
    }
  });
});
