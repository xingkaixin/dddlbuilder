import { test, expect } from '@playwright/test';

const selectIndexField = async (page: any) => {
  const indexInput = page.getByPlaceholder(/输入字段名进行匹配/i);
  await indexInput.fill('id');
  await indexInput.press('ArrowDown');
  await indexInput.press('Enter');
};

test.describe('索引管理验证 @panels', () => {
  test.beforeEach(async ({ context, page }) => {
    await context.addInitScript(() => {
      window.localStorage.setItem('fireworks_shown_2026', 'true');
    });
    await page.goto('/');
    await page.locator('#table-name').fill('index_test');

    // 添加一个字段
    const cell = page.locator(
      '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(2)',
    );
    await cell.dblclick();
    await page.locator('[data-testid="data-table"] input').fill('id');
    await page.keyboard.press('Enter');
    await expect(cell).toHaveText('id');

    const typeCell = page.locator(
      '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(4)',
    );
    await typeCell.dblclick();
    await page.locator('[data-testid="data-table"] input').fill('int');
    await page.keyboard.press('Enter');
    await expect(typeCell).toHaveText(/int/i);
  });

  test('场景：添加普通索引', async ({ page }) => {
    // 切换到“索引配置”面板
    await page.getByText('索引配置').click();

    // 在输入框中输入字段名匹配
    await selectIndexField(page);

    // 点击“添加索引”
    await page.getByRole('button', { name: /添加索引/i, exact: true }).click();

    // 验证 SQL
    const sqlOutput = page.locator(
      '.relative.flex-1.overflow-auto.px-4.py-3\\.5 pre',
    );
    await expect(sqlOutput).toContainText(
      /CREATE INDEX idx_index_test_id ON index_test/i,
    );

    // 验证索引卡片出现
    await expect(
      page.locator('span[title="双击编辑索引名称"]').filter({
        hasText: 'idx_index_test_id',
      }),
    ).toBeVisible();
  });

  test('场景：添加唯一索引', async ({ page }) => {
    await page.getByText('索引配置').click();
    await selectIndexField(page);

    await page.getByRole('button', { name: /添加唯一索引/i }).click();

    const sqlOutput = page.locator(
      '.relative.flex-1.overflow-auto.px-4.py-3\\.5 pre',
    );
    await expect(sqlOutput).toContainText(
      /CREATE UNIQUE INDEX uk_index_test_id ON index_test/i,
    );
    await expect(
      page.locator('span[title="双击编辑索引名称"]').filter({
        hasText: 'uk_index_test_id',
      }),
    ).toBeVisible();
  });

  test('场景：添加主键索引', async ({ page }) => {
    await page.getByText('索引配置').click();
    await selectIndexField(page);

    await page.getByRole('button', { name: /添加主键/i }).click();

    const sqlOutput = page.locator(
      '.relative.flex-1.overflow-auto.px-4.py-3\\.5 pre',
    );
    await expect(sqlOutput).toContainText(
      /ADD CONSTRAINT pk_index_test PRIMARY KEY/i,
    );
    await expect(
      page.locator('span[title="双击编辑索引名称"]').filter({
        hasText: 'pk_index_test',
      }),
    ).toBeVisible();
  });

  test('场景：删除索引', async ({ page }) => {
    await page.getByText('索引配置').click();
    await selectIndexField(page);
    await page.getByRole('button', { name: /添加索引/i, exact: true }).click();

    const indexName = page.getByText('idx_index_test_id', { exact: true });
    const card = indexName.locator('..').locator('..');
    await card.getByRole('button').click();

    const sqlOutput = page.locator(
      '.relative.flex-1.overflow-auto.px-4.py-3\\.5 pre',
    );
    await expect(sqlOutput).not.toContainText(
      /CREATE INDEX idx_index_test_id ON index_test/i,
    );
  });
});
