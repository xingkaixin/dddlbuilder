import { test, expect } from '@playwright/test';

test.describe('SQL 自动生成流程 @core @smoke', () => {
  test.beforeEach(async ({ context }) => {
    // 规避放烟火特效，减少测试干扰并提高速度
    await context.addInitScript(() => {
      window.localStorage.setItem('fireworks_shown_2026', 'true');
      window.localStorage.setItem(
        'ddlbuilder:state:v1',
        JSON.stringify({
          tableName: 'HYDRATION_CHECK',
          rows: [{ order: 1, fieldName: 'HYDRATED_FIELD', fieldType: 'INT' }],
        }),
      );
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: async () => {} },
        configurable: true,
      });
    });
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  });

  test('场景：填写表信息和字段后，应正确生成建表 SQL', async ({ page }) => {
    // 1. 访问首页
    await page.goto('/');
    await expect(page.locator('#table-name')).toHaveValue('HYDRATION_CHECK', {
      timeout: 10000,
    });
    await expect(
      page.locator(
        '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(2)',
      ),
    ).toHaveText('HYDRATED_FIELD', { timeout: 10000 });
    await expect(page).toHaveTitle(/筑表师/);

    // 2. 填写表信息
    const tableNameInput = page.locator('#table-name');
    const tableCommentInput = page.locator('#table-comment');

    await tableNameInput.fill('user_profile');
    await tableCommentInput.fill('用户详情表');

    // 3. 填写字段信息
    // 点击第一行字段名单元格开始输入
    const firstFieldNameCell = page.locator(
      '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(2)',
    );
    await firstFieldNameCell.dblclick();
    await page.locator('[data-testid="data-table"] input').fill('id');
    await page.keyboard.press('Enter');

    // 填写字段注释 (第三列)
    const firstFieldCommentCell = page.locator(
      '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(3)',
    );
    await firstFieldCommentCell.dblclick();
    await page.locator('[data-testid="data-table"] input').fill('用户编号');
    await page.keyboard.press('Enter');

    // 填写字段类型 (第四列)
    const firstFieldTypeCell = page.locator(
      '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(4)',
    );
    await firstFieldTypeCell.dblclick();
    await page.locator('[data-testid="data-table"] input').fill('varchar(255)');
    await page.keyboard.press('Enter');

    // 验证 UI 上的值是否已填入
    await expect(firstFieldNameCell).toHaveText('id');
    await expect(firstFieldCommentCell).toHaveText('用户编号');
    await expect(firstFieldTypeCell).toHaveText('varchar(255)');

    // 4. 验证生成的 SQL
    const sqlOutput = page.locator('[data-state="active"] pre');

    // 等待状态同步
    await expect(sqlOutput).toContainText(/CREATE TABLE\s+`?user_profile`?/i, {
      timeout: 10000,
    });
    await expect(sqlOutput).toContainText(/COMMENT\s*=?\s*'用户详情表'/i);
    await expect(sqlOutput).toContainText(/`?id`?\s+VARCHAR\(255\)/i);
    await expect(sqlOutput).toContainText(/COMMENT\s+'用户编号'/i);

    // 5. 点击第五列的 checkbox 切换为 '否' (NOT NULL)
    const firstNullableCheckbox = page.locator(
      '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(5) button[role="checkbox"]',
    );
    await firstNullableCheckbox.click();
    await page.waitForTimeout(1000); // 等待状态更新和 SQL 重新生成
    await expect(sqlOutput).toContainText(/NOT NULL/i, { timeout: 5000 });
  });

  test('场景：复制 DDL', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#table-name')).toHaveValue('HYDRATION_CHECK', {
      timeout: 10000,
    });

    await page.locator('#table-name').fill('copy_test');

    const nameCell = page.locator(
      '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(2)',
    );
    await nameCell.dblclick();
    await page.locator('[data-testid="data-table"] input').fill('id');
    await page.keyboard.press('Enter');

    const typeCell = page.locator(
      '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(4)',
    );
    await typeCell.dblclick();
    await page.locator('[data-testid="data-table"] input').fill('int');
    await page.keyboard.press('Enter');

    await page.evaluate(() => {
      (window as any).__copyTriggered = false;
      const writeText = async () => {
        (window as any).__copyTriggered = true;
      };
      try {
        Object.defineProperty(navigator, 'clipboard', {
          value: { writeText },
          configurable: true,
        });
      } catch {
        (navigator as any).clipboard = { writeText };
      }
    });

    const copyButton = page.getByRole('button', { name: /复制DDL/i });
    await copyButton.click();
    await expect
      .poll(() => page.evaluate(() => (window as any).__copyTriggered))
      .toBe(true);
  });
});
