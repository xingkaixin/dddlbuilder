import { test, expect } from '@playwright/test';

test.describe('核心 UI 交互功能测试 @core', () => {
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

  test('场景：清空所有功能应正确重置表单', async ({ page }) => {
    // 填写一些数据
    await page.locator('#table-name').fill('to_be_cleared');
    await page.locator('#table-comment').fill('即将被清空的表');

    // 填写字段
    const firstFieldNameCell = page.locator(
      '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(2)',
    );
    await firstFieldNameCell.dblclick();
    await page
      .locator('[data-testid="data-table"] input')
      .fill('field_to_clear');
    await page.keyboard.press('Enter');

    // 验证数据已填写
    await expect(page.locator('#table-name')).toHaveValue('to_be_cleared');
    await expect(firstFieldNameCell).toHaveText('field_to_clear');

    // 点击清空按钮
    await page.getByRole('button', { name: /清空/i }).click();

    // 确认对话框应该出现
    const confirmDialog = page.getByText(/确认清空所有配置？/i);
    await expect(confirmDialog).toBeVisible();

    // 取消清空
    await page.getByRole('button', { name: /取消/i }).click();
    await expect(confirmDialog).not.toBeVisible();

    // 验证数据还在
    await expect(page.locator('#table-name')).toHaveValue('to_be_cleared');

    // 再次点击清空并确认
    await page.getByRole('button', { name: /清空/i }).click();
    await page.getByRole('button', { name: /确认清空/i }).click();

    // 验证数据已被清空
    await expect(page.locator('#table-name')).toHaveValue('');
  });

  test('场景：主题可切换并支持系统跟随', async ({ page }) => {
    const html = page.locator('html');
    const themeTrigger = page.getByTestId('theme-switcher-trigger');

    await themeTrigger.click();
    await page.getByTestId('theme-option-dark').click();
    await expect(html).toHaveClass(/dark/);

    await page.reload();
    await expect(html).toHaveClass(/dark/);

    await themeTrigger.click();
    await page.getByTestId('theme-option-system').click();

    await page.emulateMedia({ colorScheme: 'light' });
    await expect(html).not.toHaveClass(/dark/);

    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(html).toHaveClass(/dark/);
  });

  test('场景：标签页切换应正常工作', async ({ page }) => {
    // 填写表名以激活 SQL 生成
    await page.locator('#table-name').fill('tab_test');

    // 测试标签页切换
    const tabs = [
      { name: /字段/i, panel: 'fields' },
      { name: /索引/i, panel: 'indexes' },
      { name: /权限/i, panel: 'permissions' },
      { name: /表选项/i, panel: 'options' },
    ];

    for (const tab of tabs) {
      const tabElement = page.getByRole('tab', { name: tab.name });
      // 检查标签是否存在（某些标签只在特定数据库下显示）
      if ((await tabElement.count()) > 0) {
        await tabElement.click();
        await expect(tabElement).toHaveAttribute('aria-selected', 'true');
      }
    }

    // 切换回字段标签
    await page.getByRole('tab', { name: /字段/i }).click();
    await expect(page.getByRole('tab', { name: /字段/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});
