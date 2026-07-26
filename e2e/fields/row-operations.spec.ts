import { test, expect } from '@playwright/test';
import { ensureBuilderVisible } from '../utils';

test.describe('字段行操作验证 @fields', () => {
  test('场景：添加多行字段并验证 SQL', async ({ page }) => {
    await page.goto('/');
    await ensureBuilderVisible(page);
    await page.locator('#table-name').fill('multi_fields');

    const sqlOutput = page.locator('[role="tabpanel"]:visible pre');

    // 填写第一行并确保 SQL 更新
    const cell1 = page.locator('[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(2)');
    await cell1.dblclick();
    await page.locator('[data-testid="data-table"] input:not([aria-hidden="true"])').fill('f1');
    await page.keyboard.press('Enter');
    const typeCell1 = page.locator(
      '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(4)',
    );
    await typeCell1.dblclick();
    await page.locator('[data-testid="data-table"] input:not([aria-hidden="true"])').fill('INT');
    await page.keyboard.press('Enter');
    await expect(sqlOutput).toContainText(/f1/i, { timeout: 10000 });

    // 填写第二行并确保 SQL 更新
    const cell2 = page.locator('[data-testid="data-table"] tbody tr:nth-child(2) td:nth-child(2)');
    await cell2.dblclick();
    await page.locator('[data-testid="data-table"] input:not([aria-hidden="true"])').fill('f2');
    await page.keyboard.press('Enter');
    const typeCell2 = page.locator(
      '[data-testid="data-table"] tbody tr:nth-child(2) td:nth-child(4)',
    );
    await typeCell2.dblclick();
    await page.locator('[data-testid="data-table"] input:not([aria-hidden="true"])').fill('INT');
    await page.keyboard.press('Enter');
    await expect(sqlOutput).toContainText(/f2/i, { timeout: 10000 });
  });

  test('场景：拖拽排序后字段顺序与 SQL 同步', async ({ page }) => {
    await page.goto('/');
    await ensureBuilderVisible(page);
    await page.locator('#table-name').fill('drag_sort_test');

    // 填入 3 个初始字段（名称 + 类型）
    for (let i = 1; i <= 3; i += 1) {
      const cell = page.locator(
        `[data-testid="data-table"] tbody tr:nth-child(${i}) td:nth-child(2)`,
      );
      await cell.dblclick();
      await page
        .locator('[data-testid="data-table"] input:not([aria-hidden="true"])')
        .fill(`field_${i}`);
      await page.keyboard.press('Enter');
      const typeCell = page.locator(
        `[data-testid="data-table"] tbody tr:nth-child(${i}) td:nth-child(4)`,
      );
      await typeCell.dblclick();
      await page.locator('[data-testid="data-table"] input:not([aria-hidden="true"])').fill('INT');
      await page.keyboard.press('Enter');
    }

    const firstHandle = page.locator(
      '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(1) button',
    );
    const thirdRow = page.locator('[data-testid="data-table"] tbody tr:nth-child(3)');

    // 确保元素在视口内，避免 elementFromPoint 返回 null
    await firstHandle.scrollIntoViewIfNeeded();
    await thirdRow.scrollIntoViewIfNeeded();

    const handleBox = await firstHandle.boundingBox();
    const targetBox = await thirdRow.boundingBox();

    expect(handleBox).not.toBeNull();
    expect(targetBox).not.toBeNull();

    if (!handleBox || !targetBox) {
      return;
    }

    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(200);
    // 先移动一小段距离以激活 dnd-kit 拖拽传感器 (distance: 6)
    await page.mouse.move(
      handleBox.x + handleBox.width / 2,
      handleBox.y + handleBox.height / 2 + 30,
      { steps: 5 },
    );
    await page.waitForTimeout(200);
    // 目标移动到第三行中心
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, {
      steps: 5,
    });
    await page.waitForTimeout(200);
    await page.mouse.up();

    const firstFieldName = page.locator(
      '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(2)',
    );
    const thirdFieldName = page.locator(
      '[data-testid="data-table"] tbody tr:nth-child(3) td:nth-child(2)',
    );

    await expect(firstFieldName).toHaveText('field_2', { timeout: 10000 });
    await expect(thirdFieldName).toHaveText('field_1', { timeout: 10000 });

    const sqlOutput = page.locator('[role="tabpanel"]:visible pre');
    const sqlText = await sqlOutput.innerText();

    expect(sqlText.indexOf('field_1')).toBeGreaterThan(-1);
    expect(sqlText.indexOf('field_2')).toBeGreaterThan(-1);
    expect(sqlText.indexOf('field_3')).toBeGreaterThan(-1);
    expect(sqlText.indexOf('field_2')).toBeLessThan(sqlText.indexOf('field_1'));
    expect(sqlText.indexOf('field_3')).toBeLessThan(sqlText.indexOf('field_1'));
  });

  test('场景：清空所有字段', async ({ page }) => {
    await page.goto('/');
    await ensureBuilderVisible(page);
    await page.locator('#table-name').fill('clear_test');

    const cell = page.locator('[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(2)');
    await cell.dblclick();
    await page
      .locator('[data-testid="data-table"] input:not([aria-hidden="true"])')
      .fill('to_be_cleared');
    await page.keyboard.press('Enter');
    await expect(cell).toHaveText('to_be_cleared', { timeout: 5000 });

    const typeCell = page.locator(
      '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(4)',
    );
    await typeCell.dblclick();
    await page.locator('[data-testid="data-table"] input:not([aria-hidden="true"])').fill('int');
    await page.keyboard.press('Enter');
    await expect(typeCell).toHaveText(/int/i);

    const sqlOutput = page.locator('[role="tabpanel"]:visible pre');
    await expect(sqlOutput).toContainText(/to_be_cleared/i, { timeout: 10000 });

    // 点击“清空所有”
    await page.getByRole('button', { name: /清空所有/i }).click();
    // 确认对话框
    await page.getByRole('button', { name: /确认清空/i }).click();

    // 验证 SQL 回到占位符状态 (表名也被清空了，所以提示请填写表名)
    await expect(sqlOutput).toContainText(/请填写表名/i, { timeout: 10000 });
  });
});
