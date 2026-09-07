import { openAdvancedSettings } from '../utils';
import { test, expect, type Page } from '@playwright/test';
import { setupHydratedState } from '../utils';

const configureMySQLTableOptions = async (page: Page) => {
  await openAdvancedSettings(page, '杂项设置');
  const panel = page.getByRole('tabpanel', { name: /杂项设置/ });
  await expect(panel.getByText('启用杂项设置', { exact: true })).toBeVisible();
  const enableSwitch = panel.getByRole('switch');
  await expect(enableSwitch).not.toBeChecked();
  await enableSwitch.click();
  await expect(enableSwitch).toBeChecked();

  for (const [label, value] of [
    ['表引擎', 'MyISAM'],
    ['字符集', 'utf8mb4'],
    ['排序规则', 'utf8mb4_bin'],
  ]) {
    await panel.getByText(label, { exact: true }).locator('..').getByRole('combobox').click();
    await page.getByRole('option', { name: value, exact: true }).click();
  }

  return panel;
};

test.describe('表选项面板功能测试 @panels', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await setupHydratedState(page);
    await expect(page.getByRole('combobox', { name: '数据库类型', exact: true })).toContainText(
      'MySQL',
    );
  });

  test('场景：MySQL 数据库应显示并能配置表选项', async ({ page }) => {
    await configureMySQLTableOptions(page);
    const sqlOutput = page.locator('[role="tabpanel"]:visible pre');
    await expect(sqlOutput).toContainText('HYDRATED_FIELD INT');
    await expect(sqlOutput).toContainText(
      'ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin',
    );
  });

  test('场景：禁用表选项后不应在 SQL 中生成', async ({ page }) => {
    const panel = await configureMySQLTableOptions(page);
    const sqlOutput = page.locator('[role="tabpanel"]:visible pre');
    await expect(sqlOutput).toContainText(
      'ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin',
    );

    const enableSwitch = panel.getByRole('switch');
    await enableSwitch.click();
    await expect(enableSwitch).not.toBeChecked();
    await expect(sqlOutput).toContainText('HYDRATED_FIELD INT');
    await expect(sqlOutput).not.toContainText(/\b(?:ENGINE|CHARSET|COLLATE)\s*=/i);
  });
});
