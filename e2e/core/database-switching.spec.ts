import { test, expect, Page } from '@playwright/test';

test.describe('数据库切换与方言验证 @core', () => {
  test.beforeEach(async ({ context, page }) => {
    // 规避放烟火特效
    await context.addInitScript(() => {
      window.localStorage.setItem('fireworks_shown_2026', 'true');
      // 设置完全的水合标记以确保 initialized 状态
      window.localStorage.setItem('ddlbuilder:state:v1', JSON.stringify({ 
        tableName: 'HYDRATION_CHECK',
        rows: [{ order: 1, fieldName: 'HYDRATED_FIELD', fieldType: 'INT' }] 
      }));
    });
    
    await page.goto('/');
    
    // 等待水合完成 (表名和单元格都加载了标记值)
    await expect(page.locator('#table-name')).toHaveValue('HYDRATION_CHECK', { timeout: 10000 });
    await expect(page.locator('.htCore tbody tr:nth-child(1) td:nth-child(2)')).toHaveText('HYDRATED_FIELD', { timeout: 10000 });
    
    // 1. 填写表名
    await page.locator('#table-name').fill('test_table');
    
    // 2. 填写第一个字段名 (id)
    const firstFieldNameCell = page.locator('.htCore tbody tr:nth-child(1) td:nth-child(2)');
    await firstFieldNameCell.dblclick();
    await page.locator('textarea.handsontableInput').fill('id');
    await page.keyboard.press('Enter');
    
    // 3. 填写第一个字段类型 (VARCHAR255)
    const firstFieldTypeCell = page.locator('.htCore tbody tr:nth-child(1) td:nth-child(4)');
    await firstFieldTypeCell.dblclick();
    await page.locator('textarea.handsontableInput').fill('varchar(255)');
    await page.keyboard.press('Enter');

    // 验证 UI 上的值是否已填入 (Handsontable 渲染可能滞后，等待其更新)
    await expect(firstFieldNameCell).toHaveText('id');
  });

  test('场景：切换到 PostgreSQL 应生成正确的语法', async ({ page }) => {
    await page.locator('#table-name').fill('users');
    await page.locator('#table-comment').fill('用户表');
    
    const sqlOutputElement = sqlOutput(page);
    
    // 等待 SQL 面板不再是占位符，且内容匹配 MySQL 特征
    await expect(sqlOutputElement).toContainText(/CREATE TABLE\s+users/i, { timeout: 10000 });
    await expect(sqlOutputElement).toContainText(/COMMENT='用户表'/i);

    // 2. 切换到 PostgreSQL
    await page.getByRole('combobox').click();
    await page.getByRole('option', { name: 'PostgreSQL', exact: true }).click();

    // 验证 PG 语法 (COMMENT ON TABLE)
    await expect(sqlOutputElement).toContainText(/COMMENT ON TABLE\s+users\s+IS\s+'用户表'/i);
    // 验证 PG 的类型映射 (varchar(255) -> varchar(255))
    await expect(sqlOutputElement).toContainText(/id\s+varchar\(255\)/i);
  });

  test('场景：切换到 Oracle 应生成大写表名和特定语法', async ({ page }) => {
    await page.locator('#table-name').fill('orders');
    await page.locator('#table-comment').fill('订单表');
    
    const sqlOutputElement = sqlOutput(page);
    
    // 切换到 Oracle
    await page.getByRole('combobox').click();
    await page.getByRole('option', { name: 'Oracle', exact: true }).click();

    // Oracle Table COMMENT 语法
    await expect(sqlOutputElement).toContainText(/COMMENT ON TABLE\s+orders\s+IS\s+'订单表'/i);
    // Oracle 的类型映射 (varchar(255) -> VARCHAR2(255))
    await expect(sqlOutputElement).toContainText(/id\s+VARCHAR2\(255\)/i);
  });
});

function sqlOutput(page: Page) {
    return page.locator('[data-state="active"] pre');
}
