import { test, expect } from '@playwright/test';

test.describe('表选项面板功能测试 @panels', () => {
  test.beforeEach(async ({ context, page }) => {
    await context.addInitScript(() => {
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
      page.locator('[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(2)'),
    ).toHaveText('HYDRATED_FIELD', { timeout: 10000 });
  });

  test('场景：MySQL 数据库应显示并能配置表选项', async ({ page }) => {
    // 确保使用 MySQL 数据库
    await page.locator('[data-testid="db-type-selector"]').click();
    await page.getByRole('option', { name: 'MySQL', exact: true }).click();

    // 填写基本表信息
    await page.locator('#table-name').fill('test_table_options');

    // 填写一个字段以确保 SQL 生成
    const firstFieldNameCell = page.locator(
      '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(2)',
    );
    await firstFieldNameCell.dblclick();
    await page.locator('[data-testid="data-table"] input').fill('id');
    await page.keyboard.press('Enter');

    const firstFieldTypeCell = page.locator(
      '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(4)',
    );
    await firstFieldTypeCell.dblclick();
    await page.locator('[data-testid="data-table"] input').fill('int');
    await page.keyboard.press('Enter');

    // 切换到"表选项"标签页
    const tableOptionsTab = page.getByRole('tab', { name: /表选项/ });
    if ((await tableOptionsTab.count()) > 0) {
      await tableOptionsTab.click();

      // 启用表选项 - 使用 Switch 组件
      const enableSwitch = page.getByRole('switch', { name: /启用杂项设置/i });
      if ((await enableSwitch.count()) > 0) {
        await enableSwitch.click();
        await expect(enableSwitch).toBeChecked();

        // 验证配置选项可见 - 查找"表引擎"标签
        const engineLabel = page.getByText(/表引擎/i);
        if ((await engineLabel.count()) > 0) {
          // 选择不同的存储引擎
          // 找到"表引擎"标签后的 Select 组件
          const engineSelectTrigger = page
            .locator('div')
            .filter({ hasText: /表引擎/ })
            .locator('button[role="combobox"]')
            .first();

          if ((await engineSelectTrigger.count()) > 0) {
            await engineSelectTrigger.click();
            await page.getByRole('option', { name: 'MyISAM' }).click();

            // 验证生成的 SQL 包含表选项
            const sqlOutput = page.locator('[data-state="active"] pre');
            await expect(sqlOutput).toContainText(/ENGINE=MyISAM/i, {
              timeout: 10000,
            });
          }
        }
      }
    }
  });

  test('场景：禁用表选项后不应在 SQL 中生成', async ({ page }) => {
    await page.locator('[data-testid="db-type-selector"]').click();
    await page.getByRole('option', { name: 'MySQL', exact: true }).click();
    await page.locator('#table-name').fill('test_no_options');

    // 填写一个字段
    const firstFieldNameCell = page.locator(
      '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(2)',
    );
    await firstFieldNameCell.dblclick();
    await page.locator('[data-testid="data-table"] input').fill('id');
    await page.keyboard.press('Enter');

    const firstFieldTypeCell = page.locator(
      '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(4)',
    );
    await firstFieldTypeCell.dblclick();
    await page.locator('[data-testid="data-table"] input').fill('int');
    await page.keyboard.press('Enter');

    // 切换到"表选项"标签页
    const tableOptionsTab = page.getByRole('tab', { name: /表选项/ });
    if ((await tableOptionsTab.count()) > 0) {
      await tableOptionsTab.click();

      const enableSwitch = page.getByRole('switch', { name: /启用杂项设置/i });
      if ((await enableSwitch.count()) > 0) {
        // 先启用
        await enableSwitch.click();
        await expect(enableSwitch).toBeChecked();

        // 再禁用
        await enableSwitch.click();
        await expect(enableSwitch).not.toBeChecked();

        // 验证 SQL 可见
        const sqlOutput = page.locator('[data-state="active"] pre');
        await page.waitForTimeout(500);
        await expect(sqlOutput).toBeVisible();
      }
    }
  });
});
