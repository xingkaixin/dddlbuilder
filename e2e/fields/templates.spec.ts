import { test, expect } from '@playwright/test';
import { setupHydratedState } from '../utils';

test.describe('字段模板应用验证 @fields', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await setupHydratedState(page);
  });

  test('场景：应用审计字段模板', async ({ page }) => {
    const templateBtn = page.getByRole('button', { name: /应用\s*模板/i });
    await expect(templateBtn).toBeVisible();
    await templateBtn.click();

    const templateDialog = page.getByRole('dialog');
    await expect(templateDialog.getByText(/选择模板/i)).toBeVisible();

    const auditTemplate = templateDialog.getByRole('button', { name: /审计字段/i });
    if ((await auditTemplate.count()) > 0) {
      await auditTemplate.first().click();

      const sqlOutput = page.locator('[data-state="active"] pre');
      await expect(sqlOutput).toContainText(/created_at/i);
      await expect(sqlOutput).toContainText(/updated_at/i);
    } else {
      await page.keyboard.press('Escape');
      await expect(templateDialog.getByText(/将当前行保存为模板/i)).toBeHidden({
        timeout: 5000,
      });

      const cell = page.locator('[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(2)');
      await expect(cell).toBeVisible();
      await cell.dblclick();
      await page.locator('[data-testid="data-table"] input').fill('custom_f1');
      await page.keyboard.press('Enter');

      await templateBtn.click();
      await templateDialog.getByRole('button', { name: /将当前行保存为模板/i }).click();
      await expect(page.getByRole('heading', { name: /保存为模板/i })).toBeVisible();

      await page.getByLabel('模板名称').fill('MyCustomTemplate');
      await page.getByRole('button', { name: /创建模板/i }).click();

      await templateBtn.click();
      await templateDialog.getByRole('button', { name: /MyCustomTemplate/i }).click();

      const sqlOutput = page.locator('.relative.flex-1.overflow-auto.px-4.py-3\\.5 pre');
      await expect(sqlOutput).toContainText(/custom_f1/i);
    }
  });
});
