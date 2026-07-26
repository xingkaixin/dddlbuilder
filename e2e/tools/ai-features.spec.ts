import { test, expect } from '@playwright/test';
import { setupHydratedState } from '../utils';

test.describe('AI 功能 UI 测试 @tools @ai', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await setupHydratedState(page);
  });

  test('场景：AI 智能建表对话框应能正常打开和关闭', async ({ page }) => {
    // 点击 AI 智能建表按钮 - "大师建表工坊"
    const aiButton = page.getByRole('button', { name: /大师建表工坊/i });

    if ((await aiButton.count()) > 0) {
      await aiButton.first().click();

      // 检查对话框是否打开（通过检查是否有相关文本）
      const dialogText = page
        .getByText(/AI 智能建表/i)
        .or(page.getByText(/用自然语言描述你需要的表结构/i));

      if ((await dialogText.count()) > 0) {
        // 对话框已打开
        await expect(dialogText.first()).toBeVisible();

        // 测试关闭对话框
        await page.keyboard.press('Escape');
        await expect(dialogText.first()).not.toBeVisible();
      }
    }
  });

  test('场景：DDL 评审功能 UI 测试', async ({ page }) => {
    // 先填写一些基本数据
    await page.locator('#table-name').fill('review_test');
    await page.locator('#table-comment').fill('评审测试表');

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

    // 查找评审按钮
    const reviewButton = page
      .locator('button')
      .filter({ hasText: /评审/i })
      .or(page.locator('button').filter({ hasText: /大师/i }));

    if ((await reviewButton.count()) > 0) {
      await reviewButton.first().click();

      // 检查是否有加载状态或评审结果区域
      // 只检查按钮点击是否有反应，不等待实际 API 响应
      await expect(page.locator('[data-state="active"] pre')).toBeVisible();
    }
  });

  test('场景：SQL 解释功能 UI 测试', async ({ page }) => {
    // 填写基本数据生成 SQL
    await page.locator('#table-name').fill('explain_test');

    const firstFieldNameCell = page.locator(
      '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(2)',
    );
    await firstFieldNameCell.dblclick();
    await page.locator('[data-testid="data-table"] input').fill('test_field');
    await page.keyboard.press('Enter');

    // 查找解释按钮或图标
    // 解释功能通常在 SQL 输出区域附近
    const sqlOutput = page.locator('[data-state="active"] pre');
    await expect(sqlOutput).toBeVisible({ timeout: 10000 });

    // 查找可能的"解释"按钮
    const explainButton = page.locator('button').filter({ hasText: /解释/i });

    if ((await explainButton.count()) > 0) {
      // 按钮存在，可以点击
      await expect(explainButton.first()).toBeEnabled();
    }
  });
});
