import { test, expect, type Page, type Route } from '@playwright/test';
import { setupHydratedState, ensureBuilderVisible } from '../utils';

test.describe('核心 UI 交互功能测试 @core', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await setupHydratedState(page);
  });

  const selectTheme = async (page: Page, name: RegExp, legacyTestId: string) => {
    const legacyTrigger = page.getByTestId('theme-switcher-trigger');
    if (await legacyTrigger.isVisible({ timeout: 1000 }).catch(() => false)) {
      await legacyTrigger.click();
      await page.getByTestId(legacyTestId).click();
      return;
    }

    await page.getByRole('button', { name: /功能菜单|Menu/i }).click();
    await page.getByRole('menuitem', { name: /主题|Theme/i }).click();
    const themeOption = page.getByRole('menuitemradio', { name });
    await expect(themeOption).toBeVisible();
    await themeOption.dispatchEvent('click');
  };

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
      .locator('[data-testid="data-table"] input:not([aria-hidden="true"])')
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

  test('场景：默认配置下不显示烟花入口和节日弹层', async ({ page }) => {
    await expect(page.getByRole('button', { name: /点击播放烟花|Play fireworks/i })).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: /新春烟花/i })).toHaveCount(0);
  });

  test('场景：主题可切换并支持系统跟随', async ({ page }) => {
    const html = page.locator('html');

    await selectTheme(page, /暗色|Dark/i, 'theme-option-dark');
    await expect(html).toHaveClass(/dark/);

    await page.reload();
    await expect(html).toHaveClass(/dark/);

    await selectTheme(page, /跟随系统|System/i, 'theme-option-system');

    await page.emulateMedia({ colorScheme: 'light' });
    await expect(html).not.toHaveClass(/dark/);

    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(html).toHaveClass(/dark/);
  });

  test('场景：切换日语后应更新并记住界面语言', async ({ page }) => {
    await page.getByRole('button', { name: /功能菜单|Menu/i }).click();
    await page.getByRole('menuitem', { name: /语言|Language/i }).click();
    await page.getByRole('menuitemradio', { name: '日本語' }).click();

    await expect(page.locator('html')).toHaveAttribute('lang', 'ja-JP');
    await expect(
      page.getByText('プロフェッショナルなデータベーステーブル設計ツール', { exact: true }),
    ).toBeVisible();

    await page.reload();

    await expect(page.locator('html')).toHaveAttribute('lang', 'ja-JP');
    await expect(
      page.getByText('プロフェッショナルなデータベーステーブル設計ツール', { exact: true }),
    ).toBeVisible();
  });

  test('场景：标签页切换应正常工作', async ({ page }) => {
    // 填写表名以激活 SQL 生成
    await page.locator('#table-name').fill('tab_test');

    // 收起侧边栏避免遮挡标签页
    const collapseBtn = page.getByRole('button', { name: /收起侧边栏/i });
    if (await collapseBtn.isVisible().catch(() => false)) {
      await collapseBtn.click();
    }

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
    await expect(page.getByRole('tab', { name: /字段/i })).toHaveAttribute('aria-selected', 'true');
  });

  test('场景：收起工作区侧栏后应释放全部横向空间', async ({ page }) => {
    const sidebar = page.getByTestId('workspace-sidebar');
    const content = page.getByTestId('workspace-content');

    await expect(sidebar).toBeVisible();
    const expandedContentBox = await content.boundingBox();
    expect(expandedContentBox?.x).toBeGreaterThan(0);

    await page.getByRole('button', { name: /收起侧边栏|Collapse sidebar/i }).click();

    await expect(sidebar).toHaveCount(0);
    await expect(page.getByRole('button', { name: /展开侧边栏|Expand sidebar/i })).toBeVisible();
    const collapsedContentBox = await content.boundingBox();
    expect(collapsedContentBox?.x).toBe(0);

    await page.getByRole('button', { name: /展开侧边栏|Expand sidebar/i }).click();
    await expect(sidebar).toBeVisible();
  });

  test('场景：收起输出面板后应释放全部横向空间', async ({ page }) => {
    const outputPanel = page.getByTestId('output-panel');

    await expect(outputPanel).toBeVisible();
    await page.getByRole('button', { name: /收起输出面板|Collapse output panel/i }).click();

    await expect(outputPanel).toHaveCount(0);
    const tableActions = page.getByTestId('table-config-actions');
    const expandButton = tableActions.getByRole('button', {
      name: /展开输出面板|Expand output panel/i,
    });
    await expect(expandButton).toBeVisible();

    await expandButton.click();
    await expect(outputPanel).toBeVisible();
  });
});

test('编辑器测试页面不依赖外部字体和统计服务完成加载', async ({ page }) => {
  const pending: Route[] = [];
  await page.route(/^https:\/\//, (route) => {
    pending.push(route);
  });
  try {
    await page.goto('/');
    await ensureBuilderVisible(page);
  } finally {
    await Promise.all(pending.map((route) => route.abort()));
  }
});
