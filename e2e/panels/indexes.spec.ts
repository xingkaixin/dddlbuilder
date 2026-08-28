import { test, expect } from '@playwright/test';
import { ensureBuilderVisible } from '../utils';

const selectIndexField = async (page: any) => {
  const indexInput = page.getByPlaceholder(/输入字段名进行匹配/i);
  await indexInput.fill('id');
  await expect(page.locator('[role="listbox"] [role="option"]').first()).toBeVisible();
  await indexInput.press('ArrowDown');
  await indexInput.press('Enter');
};

test.describe('索引管理验证 @panels', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await ensureBuilderVisible(page);
    await page.locator('#table-name').fill('index_test');

    // 添加一个字段
    const cell = page.locator('[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(2)');
    await cell.dblclick();
    await page.locator('[data-testid="data-table"] input:not([aria-hidden="true"])').fill('id');
    await page.keyboard.press('Enter');
    await expect(cell).toHaveText('id');

    const typeCell = page.locator(
      '[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(4)',
    );
    await typeCell.dblclick();
    await page.locator('[data-testid="data-table"] input:not([aria-hidden="true"])').fill('int');
    await page.keyboard.press('Enter');
    await expect(typeCell).toHaveText(/int/i);
  });

  test('场景：添加普通索引', async ({ page }) => {
    await page.getByText('索引配置').click();

    await selectIndexField(page);

    await page.getByRole('button', { name: '保存索引', exact: true }).click();

    // 等待索引名称出现在列表中
    await expect(page.getByText('idx_index_test_id').first()).toBeVisible();

    const sqlOutput = page.locator('.relative.flex-1.overflow-auto.px-4.py-3\\.5 pre');
    await expect(sqlOutput).toContainText(/INDEX idx_index_test_id \(id ASC\)/i);
  });

  test('场景：添加唯一索引', async ({ page }) => {
    await page.getByText('索引配置').click();

    await page.getByRole('button', { name: /添加唯一索引/i }).click();
    await selectIndexField(page);
    await page.getByRole('button', { name: '保存索引', exact: true }).click();

    await expect(page.getByText('uk_index_test_id').first()).toBeVisible();

    const sqlOutput = page.locator('.relative.flex-1.overflow-auto.px-4.py-3\\.5 pre');
    await expect(sqlOutput).toContainText(/UNIQUE INDEX uk_index_test_id \(id ASC\)/i);
  });

  test('场景：添加主键索引', async ({ page }) => {
    await page.getByText('索引配置').click();

    await page.getByRole('button', { name: /添加主键/i }).click();
    await selectIndexField(page);
    await page.getByRole('button', { name: '保存索引', exact: true }).click();

    await expect(page.getByText('pk_index_test').first()).toBeVisible();

    const sqlOutput = page.locator('.relative.flex-1.overflow-auto.px-4.py-3\\.5 pre');
    await expect(sqlOutput).toContainText(/PRIMARY KEY \(id ASC\)/i);
    await expect(sqlOutput).not.toContainText(/ALTER TABLE/i);
  });

  test('场景：删除索引', async ({ page }) => {
    await page.getByText('索引配置').click();
    await selectIndexField(page);
    await page.getByRole('button', { name: '保存索引', exact: true }).click();

    // 等待索引保存成功
    await expect(page.getByText('idx_index_test_id').first()).toBeVisible();

    // 点击索引卡片的删除按钮
    const indexCard = page
      .getByText('idx_index_test_id', { exact: true })
      .first()
      .locator('xpath=ancestor::div[@role="button"]');
    await indexCard.hover();
    await indexCard.getByRole('button', { name: /删除索引/i }).click();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: '删除索引', exact: true })
      .click();

    const sqlOutput = page.locator('.relative.flex-1.overflow-auto.px-4.py-3\\.5 pre');
    await expect(sqlOutput).not.toContainText(/INDEX idx_index_test_id/i);
  });
});
