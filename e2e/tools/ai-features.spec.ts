import { test, expect } from '@playwright/test';
import { setupHydratedState } from '../utils';

test('AI 注释请求在切换文档后取消，不覆盖另一张表', async ({ page }) => {
  let finishResponse!: () => void;
  const responseReady = new Promise<void>((resolve) => {
    finishResponse = resolve;
  });
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/me') {
      await route.fulfill({
        json: {
          signedIn: true,
          user: {
            userId: 'ai-comments-user',
            email: 'comments@example.test',
            name: 'Comments',
            emailVerified: true,
          },
        },
      });
    } else if (path === '/api/workspaces') {
      await route.fulfill({ json: { workspaceId: 'ai-comments-workspace' } });
    } else if (path === '/api/credits/balance') {
      await route.fulfill({ json: { balance: 1000 } });
    } else if (path === '/api/generate-comments') {
      await responseReady;
      await route.fulfill({
        json: {
          tableComment: '用户表',
          fields: [{ fieldName: 'HYDRATED_FIELD', fieldComment: '用户字段' }],
        },
      });
    } else {
      await route.fulfill({ status: 503, json: { error: 'Not available in this test' } });
    }
  });

  try {
    await page.goto('/');
    await setupHydratedState(page);
    await page.locator('#table-name').fill('users');
    await page.getByRole('button', { name: '新建草稿', exact: true }).click();
    await setupHydratedState(page);
    await page.locator('#table-name').fill('orders');
    await page.locator('#table-comment').fill('订单表，请保留');
    await page
      .locator('div[role="button"]')
      .filter({ hasText: /^users/ })
      .click();
    await expect(page.locator('#table-name')).toHaveValue('users');

    const requestStarted = page.waitForRequest('**/api/generate-comments');
    await page.getByRole('button', { name: 'AI 注释', exact: true }).click();
    await page.getByRole('menuitem', { name: '补全缺失注释' }).click();
    const request = await requestStarted;
    expect(request.postDataJSON().tableName).toBe('users');
    const cancelled = page.waitForEvent('requestfailed', (failed) => failed === request);
    await page
      .locator('div[role="button"]')
      .filter({ hasText: /^orders/ })
      .click();
    finishResponse();
    await cancelled;

    await expect(page.getByRole('button', { name: 'AI 注释', exact: true })).toBeEnabled();
    await expect(page.locator('#table-name')).toHaveValue('orders');
    await expect(page.locator('#table-comment')).toHaveValue('订单表，请保留');
    await expect(page.getByTestId('data-table')).not.toContainText('用户字段');
  } finally {
    finishResponse();
  }
});

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
    await page.locator('[data-testid="data-table"] input:not([aria-hidden="true"])').fill('id');
    await page.keyboard.press('Enter');

    const firstFieldTypeCell = page.locator(
      '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(4)',
    );
    await firstFieldTypeCell.dblclick();
    await page.locator('[data-testid="data-table"] input:not([aria-hidden="true"])').fill('int');
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
      await expect(page.locator('[role="tabpanel"]:visible pre')).toBeVisible();
    }
  });

  test('场景：SQL 解释功能 UI 测试', async ({ page }) => {
    // 填写基本数据生成 SQL
    await page.locator('#table-name').fill('explain_test');

    const firstFieldNameCell = page.locator(
      '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(2)',
    );
    await firstFieldNameCell.dblclick();
    await page
      .locator('[data-testid="data-table"] input:not([aria-hidden="true"])')
      .fill('test_field');
    await page.keyboard.press('Enter');

    // 查找解释按钮或图标
    // 解释功能通常在 SQL 输出区域附近
    const sqlOutput = page.locator('[role="tabpanel"]:visible pre');
    await expect(sqlOutput).toBeVisible({ timeout: 10000 });

    // 查找可能的"解释"按钮
    const explainButton = page.locator('button').filter({ hasText: /解释/i });

    if ((await explainButton.count()) > 0) {
      // 按钮存在，可以点击
      await expect(explainButton.first()).toBeEnabled();
    }
  });
});

test('AI 修改拒绝缺失字段的索引，补选字段后允许应用', async ({ page }) => {
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/me') {
      await route.fulfill({
        json: {
          signedIn: true,
          user: {
            userId: 'patch-user',
            email: 'patch@example.test',
            name: 'Patch',
            emailVerified: true,
          },
        },
      });
    } else if (path === '/api/workspaces') {
      await route.fulfill({ json: { workspaceId: 'patch-workspace' } });
    } else if (path === '/api/credits/balance') {
      await route.fulfill({ json: { balance: 1000 } });
    } else if (path === '/api/generate-table') {
      const { existingConfig } = route.request().postDataJSON();
      await route.fulfill({
        json: {
          tableName: existingConfig.tableName,
          tableComment: existingConfig.tableComment,
          fields: [
            ...existingConfig.rows.filter((row: { fieldName: string }) => row.fieldName.trim()),
            {
              fieldName: 'email',
              fieldType: 'varchar(255)',
              fieldComment: '',
              nullable: true,
              defaultKind: 'none',
              defaultValue: '',
              isPrimaryKey: false,
            },
          ],
          indexes: [
            {
              name: 'email_lookup',
              unique: false,
              fields: [{ name: 'email', direction: 'ASC' }],
            },
          ],
        },
      });
    } else {
      await route.fulfill({ status: 503, json: { error: 'Not available in this test' } });
    }
  });
  await page.goto('/');
  await setupHydratedState(page);
  await page.getByRole('button', { name: 'AI 修改', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'AI 修改当前表' });
  await dialog.locator('#ai-patch-input').fill('新增 email 和对应索引');
  await dialog.getByRole('button', { name: '发送', exact: true }).click();
  const changes = dialog.getByRole('button', { name: '切换变更选择' });
  await expect(changes).toHaveCount(2);
  await changes.nth(1).click();
  await dialog.getByRole('button', { name: '应用 1 项变更' }).click();
  await expect(page.getByText(/未能应用变更.*Unknown index field: email/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: '应用 1 项变更' })).toBeEnabled();
  await expect(dialog.getByText('email', { exact: true })).toBeVisible();
  await changes.first().click();
  await dialog.getByRole('button', { name: '应用 2 项变更' }).click();
  await expect(dialog.getByText('本次没有发现可应用的结构变更')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[role="tabpanel"]:visible pre')).toContainText(
    'CREATE INDEX email_lookup',
  );
  await expect(page.locator('[role="tabpanel"]:visible pre')).toContainText('email VARCHAR(255)');
});
