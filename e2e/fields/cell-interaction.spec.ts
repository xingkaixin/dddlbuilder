import { test, expect } from '@playwright/test';

test.describe('单元格深度交互验证 @fields', () => {
  test.beforeEach(async ({ context, page }) => {
    await context.addInitScript(() => {
      window.localStorage.setItem('fireworks_shown_2026', 'true');
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
      page.locator('.htCore tbody tr:nth-child(1) td:nth-child(2)'),
    ).toHaveText('HYDRATED_FIELD', { timeout: 10000 });
    await page.locator('#table-name').fill('cell_test');
  });

  test('场景：操作“可为空”复选框', async ({ page }) => {
    await page.locator('#table-name').fill('cell_test');

    const firstFieldNameCell = page.locator(
      '.htCore tbody tr:nth-child(1) td:nth-child(2)',
    );
    await firstFieldNameCell.dblclick();
    await page.locator('textarea.handsontableInput').fill('f1');
    await page.keyboard.press('Enter');
    await expect(firstFieldNameCell).toHaveText('f1', { timeout: 5000 });

    const sqlOutput = page.locator('[data-state="active"] pre');
    // 等待 SQL 生成
    await expect(sqlOutput).toContainText(/f1/i, { timeout: 10000 });

    // 点击第五列 (可为空)
    const nullableCell = page.locator(
      '.htCore tbody tr:nth-child(1) td:nth-child(5)',
    );
    await nullableCell.click();
    await page.keyboard.press('Space');

    // 变为“否” (NOT NULL)
    // 注意：水合标记中类型是 INT
    await expect(sqlOutput).toContainText(/f1\s+INT\s+NOT NULL/i);

    // 再点击一次回到“是”
    await page.keyboard.press('Space');
    await expect(sqlOutput).not.toContainText(/NOT NULL/i);
  });

  test('场景：使用 Tab 键在跨行/跨列导航并输入', async ({ page }) => {
    const cell_1_2 = page.locator(
      '.htCore tbody tr:nth-child(1) td:nth-child(2)',
    );
    await cell_1_2.dblclick();
    await page.locator('textarea.handsontableInput').fill('id');

    // 使用 Tab 导航，并在每个停顿处使用 type (HOT 会在焦点改变且输入时自动开启编辑)
    await page.keyboard.press('Tab'); // 移动到第 3 列 (注释)
    await page.keyboard.type('primary_key', { delay: 50 });

    await page.keyboard.press('Tab'); // 移动到第 4 列 (类型)
    await page.keyboard.type('bigint', { delay: 50 });

    await page.keyboard.press('Enter');

    const sqlOutput = page.locator('[data-state="active"] pre');
    await expect(sqlOutput).toContainText(/id\s+BIGINT/i, { timeout: 10000 });
    await expect(sqlOutput).toContainText(/COMMENT\s+'primary_key'/i);
  });
});
