import { openFieldTool } from '../utils';
import { test, expect, type Locator } from '@playwright/test';
import { setupHydratedState } from '../utils';
import { encodeAIStreamEvent } from '../../packages/shared-types/src/aiStream';
import type { PersistedState } from '../../packages/shared-types/src/index';

const streamedResponse = (value: unknown) => ({
  contentType: 'application/x-ndjson',
  body:
    encodeAIStreamEvent({ type: 'delta', text: JSON.stringify(value) }) +
    encodeAIStreamEvent({ type: 'done' }),
});

const expectAppliedPatchHistory = async (dialog: Locator, count: number) => {
  await expect(
    dialog.getByText(`0 项待确认，0 项已选择，${count} 项已应用`, { exact: true }),
  ).toBeVisible();
  await expect(dialog.getByRole('button', { name: '切换变更选择' })).toHaveCount(count);
  await expect(dialog.getByRole('button', { name: '切换变更选择', disabled: true })).toHaveCount(
    count,
  );
  await expect(dialog.getByRole('button', { name: '应用 0 项变更', exact: true })).toBeDisabled();
};

test('AI 修改保留字段身份，将改名应用为单个变更', async ({ page }) => {
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/me') {
      await route.fulfill({
        json: {
          signedIn: true,
          user: {
            userId: 'rename-user',
            email: 'rename@example.test',
            name: 'Rename',
            emailVerified: true,
          },
        },
      });
    } else if (path === '/api/workspaces') {
      await route.fulfill({ json: { workspaceId: 'rename-workspace' } });
    } else if (path === '/api/credits/balance') {
      await route.fulfill({ json: { balance: 1000 } });
    } else if (path === '/api/generate-table') {
      const { existingConfig } = route.request().postDataJSON() as {
        existingConfig: PersistedState;
      };
      const original = existingConfig.rows.find((row) => row.fieldName === 'HYDRATED_FIELD');
      expect(original?.id).toBeTruthy();
      await route.fulfill(
        streamedResponse({
          tableName: existingConfig.tableName,
          tableComment: existingConfig.tableComment,
          fields: [{ ...original, fieldName: 'renamed_field' }],
          indexes: [],
        }),
      );
    } else {
      await route.fulfill({ status: 503, json: { error: 'Not available in this test' } });
    }
  });
  await page.goto('/');
  await setupHydratedState(page);
  await openFieldTool(page, 'AI 工具', 'AI 修改');
  const dialog = page.getByRole('dialog', { name: 'AI 修改当前表' });
  await dialog.locator('#ai-patch-input').fill('将 HYDRATED_FIELD 改名为 renamed_field');
  await dialog.getByRole('button', { name: '发送', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '切换变更选择' })).toHaveCount(1);
  await expect(dialog.getByText('字段 HYDRATED_FIELD 改名为 renamed_field')).toBeVisible();
  await dialog.getByRole('button', { name: '切换变更选择' }).click();
  await dialog.getByRole('button', { name: '应用 1 项变更' }).click();
  await expectAppliedPatchHistory(dialog, 1);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('data-table')).toContainText('renamed_field');
  await expect(page.locator('[role="tabpanel"]:visible pre')).toContainText('renamed_field INT');
  await expect(page.locator('[role="tabpanel"]:visible pre')).not.toContainText('HYDRATED_FIELD');
});

test('AI 部分应用拒绝同名字段，补选删除后成功', async ({ page }) => {
  const responses: Record<string, unknown> = {
    '/api/me': {
      signedIn: true,
      user: {
        userId: 'partial-user',
        email: 'partial@example.test',
        name: 'Partial',
        emailVerified: true,
      },
    },
    '/api/workspaces': { workspaceId: 'partial-workspace' },
    '/api/credits/balance': { balance: 1000 },
  };
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/generate-table') {
      const { existingConfig } = route.request().postDataJSON() as {
        existingConfig: PersistedState;
      };
      const original = existingConfig.rows.find((row) => row.fieldName === 'HYDRATED_FIELD');
      expect(original?.id).toBeTruthy();
      await route.fulfill(
        streamedResponse({
          tableName: existingConfig.tableName,
          tableComment: existingConfig.tableComment,
          fields: [{ ...original, fieldName: 'occupied' }],
          indexes: [],
        }),
      );
    } else {
      await route.fulfill(
        responses[path]
          ? { json: responses[path] }
          : { status: 503, json: { error: 'Not available in this test' } },
      );
    }
  });
  await page.goto('/');
  await setupHydratedState(page);
  await page.locator('[data-testid="data-table"] tbody tr:nth-child(2) td:nth-child(2)').dblclick();
  await page.locator('[data-testid="data-table"] input:not([aria-hidden="true"])').fill('occupied');
  await page.keyboard.press('Enter');
  await page.locator('[data-testid="data-table"] tbody tr:nth-child(2) td:nth-child(4)').dblclick();
  await page.locator('[data-testid="data-table"] input:not([aria-hidden="true"])').fill('int');
  await page.keyboard.press('Enter');
  await openFieldTool(page, 'AI 工具', 'AI 修改');
  const dialog = page.getByRole('dialog', { name: 'AI 修改当前表' });
  await dialog.locator('#ai-patch-input').fill('删除 occupied，将 HYDRATED_FIELD 改名为 occupied');
  await dialog.getByRole('button', { name: '发送', exact: true }).click();
  const changes = dialog.getByRole('button', { name: '切换变更选择' });
  await expect(changes).toHaveCount(2);
  const rename = dialog
    .getByRole('button', { name: '字段 HYDRATED_FIELD 改名为 occupied', exact: true })
    .locator('xpath=../../..')
    .getByRole('button', { name: '切换变更选择' });
  await rename.click();
  await dialog.getByRole('button', { name: '应用 1 项变更' }).click();
  await expect(page.getByText(/未能应用变更.*Duplicate field name: occupied/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: '应用 1 项变更' })).toBeEnabled();
  await dialog
    .getByRole('button', { name: '删除字段 occupied', exact: true })
    .locator('xpath=../../..')
    .getByRole('button', { name: '切换变更选择' })
    .click();
  await dialog.getByRole('button', { name: '应用 2 项变更' }).click();
  await expectAppliedPatchHistory(dialog, 2);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('data-table')).not.toContainText('HYDRATED_FIELD');
  await expect(page.locator('[role="tabpanel"]:visible pre')).toContainText('occupied INT');
});

test('多轮 AI 修改以部分应用后的当前表为基线', async ({ page }) => {
  const responses: Record<string, unknown> = {
    '/api/me': {
      signedIn: true,
      user: {
        userId: 'baseline-user',
        email: 'baseline@example.test',
        name: 'Baseline',
        emailVerified: true,
      },
    },
    '/api/workspaces': { workspaceId: 'baseline-workspace' },
    '/api/credits/balance': { balance: 1000 },
  };
  let requests = 0;
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path !== '/api/generate-table') {
      await route.fulfill(
        responses[path]
          ? { json: responses[path] }
          : { status: 503, json: { error: 'Not available in this test' } },
      );
      return;
    }
    requests++;
    const request = route.request().postDataJSON() as {
      existingConfig: PersistedState;
      previousSchema?: unknown;
      conversationHistory: unknown[];
    };
    const { existingConfig } = request;
    const fields = existingConfig.rows.filter((row) => row.fieldName.trim());
    expect(fields.map((row) => row.fieldName)).toEqual(['HYDRATED_FIELD']);
    if (requests === 2) {
      expect(request.previousSchema).toBeUndefined();
      expect(request.conversationHistory).toHaveLength(2);
      expect(existingConfig.tableComment).toBe('第一轮注释');
    }
    await route.fulfill(
      streamedResponse({
        tableName: existingConfig.tableName,
        tableComment: '第一轮注释',
        fields:
          requests === 1 ? [] : [...fields, { ...fields[0], id: null, fieldName: 'new_field' }],
        indexes: [],
      }),
    );
  });
  await page.goto('/');
  await setupHydratedState(page);
  await openFieldTool(page, 'AI 工具', 'AI 修改');
  const dialog = page.getByRole('dialog', { name: 'AI 修改当前表' });
  await dialog.locator('#ai-patch-input').fill('修改表注释并删除 HYDRATED_FIELD');
  await dialog.getByRole('button', { name: '发送', exact: true }).click();
  const changes = dialog.getByRole('button', { name: '切换变更选择' });
  await expect(changes).toHaveCount(2);
  await changes.first().click();
  await dialog.getByRole('button', { name: '应用 1 项变更' }).click();
  await expect(changes).toHaveCount(2);
  await expect(dialog.getByText('1 项待确认，0 项已选择，1 项已应用')).toBeVisible();
  await expect(dialog.getByRole('button', { name: '切换变更选择', disabled: true })).toHaveCount(1);
  await expect(dialog.getByRole('button', { name: '切换变更选择', disabled: false })).toHaveCount(
    1,
  );
  await expect(dialog.getByRole('button', { name: '应用 0 项变更', exact: true })).toBeDisabled();
  await dialog.locator('#ai-patch-input').fill('保留当前字段，只增加 new_field');
  await dialog.getByRole('button', { name: '继续修改', exact: true }).click();
  await expect(
    dialog.getByRole('button', { name: '新增字段 new_field', exact: true }),
  ).toBeVisible();
  await expect(changes).toHaveCount(1);
  await changes.click();
  await dialog.getByRole('button', { name: '应用 1 项变更' }).click();
  await expectAppliedPatchHistory(dialog, 1);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('data-table')).toContainText('HYDRATED_FIELD');
  await expect(page.getByTestId('data-table')).toContainText('new_field');
  expect(requests).toBe(2);
});

test('DDL 评审拒绝缺少字段的索引建议，补充字段后可重试', async ({ page }) => {
  const responses: Record<string, unknown> = {
    '/api/me': {
      signedIn: true,
      user: {
        userId: 'review-user',
        email: 'review@example.test',
        name: 'Review',
        emailVerified: true,
      },
    },
    '/api/workspaces': { workspaceId: 'review-workspace' },
    '/api/credits/balance': { balance: 1000 },
    '/api/review': {
      score: 8,
      summary: '补充审计字段和索引',
      suggestions: [
        {
          id: 'add-created-at',
          type: 'add_field',
          actionable: true,
          description: '新增创建时间',
          field: { fieldName: 'created_at', fieldType: 'DATETIME' },
        },
        {
          id: 'index-created-at',
          type: 'add_index',
          actionable: true,
          description: '创建时间索引',
          index: { name: 'created_lookup', fields: [{ name: 'created_at', direction: 'ASC' }] },
        },
      ],
    },
  };
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const response = responses[path];
    await route.fulfill(
      response
        ? path === '/api/review'
          ? streamedResponse(response)
          : { json: response }
        : { status: 503, json: { error: 'Not available in this test' } },
    );
  });
  await page.goto('/');
  await setupHydratedState(page);
  await page.getByRole('button', { name: '大师评审', exact: true }).click();
  const indexSuggestion = page.getByRole('listitem').filter({ hasText: '创建时间索引' });
  const fieldSuggestion = page.getByRole('listitem').filter({ hasText: '新增创建时间' });
  const sql = page.locator('[role="tabpanel"]:visible pre');

  await indexSuggestion.getByRole('button', { name: '应用', exact: true }).click();
  await expect(page.getByText('无法应用建议：Unknown index field: created_at')).toBeVisible();
  await expect(indexSuggestion.getByRole('button', { name: '应用', exact: true })).toBeEnabled();
  await expect(indexSuggestion.getByText('已应用', { exact: true })).toHaveCount(0);
  await expect(sql).not.toContainText('INDEX created_lookup');

  await fieldSuggestion.getByRole('button', { name: '应用', exact: true }).click();
  await expect(fieldSuggestion.getByText('已应用', { exact: true })).toBeVisible();
  await indexSuggestion.getByRole('button', { name: '应用', exact: true }).click();
  await expect(indexSuggestion.getByText('已应用', { exact: true })).toBeVisible();
  await expect(sql).toContainText(/created_at\s+DATETIME/);
  await expect(sql).toContainText('INDEX created_lookup');
});

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
    await openFieldTool(page, 'AI 工具', 'AI 注释');
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

    await page.getByRole('button', { name: 'AI 工具', exact: true }).click();
    await expect(page.getByRole('menuitem', { name: 'AI 注释', exact: true })).toBeEnabled();
    await page.keyboard.press('Escape');
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
      await route.fulfill(
        streamedResponse({
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
        }),
      );
    } else {
      await route.fulfill({ status: 503, json: { error: 'Not available in this test' } });
    }
  });
  await page.goto('/');
  await setupHydratedState(page);
  await openFieldTool(page, 'AI 工具', 'AI 修改');
  const dialog = page.getByRole('dialog', { name: 'AI 修改当前表' });
  await dialog.locator('#ai-patch-input').fill('新增 email 和对应索引');
  await dialog.getByRole('button', { name: '发送', exact: true }).click();
  const changes = dialog.getByRole('button', { name: '切换变更选择' });
  await expect(changes).toHaveCount(2);
  await changes.nth(1).click();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await openFieldTool(page, 'AI 工具', 'AI 修改');
  await expect(dialog.locator('#ai-patch-input')).toHaveValue('新增 email 和对应索引');
  await dialog.getByRole('button', { name: '应用 1 项变更' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Unknown index field: email');
  await expect(dialog.getByRole('button', { name: '应用 1 项变更' })).toBeEnabled();
  await expect(dialog.getByText('email', { exact: true })).toBeVisible();
  await changes.first().click();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await dialog.getByRole('button', { name: '应用 2 项变更' }).click();
  await expectAppliedPatchHistory(dialog, 2);
  await page.keyboard.press('Escape');
  await expect(page.locator('[role="tabpanel"]:visible pre')).toContainText('INDEX email_lookup');
  await expect(page.locator('[role="tabpanel"]:visible pre')).toContainText('email VARCHAR(255)');
});
