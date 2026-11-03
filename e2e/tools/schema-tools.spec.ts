import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { SqlParser } from '../../packages/ddl-core/src/parser/SqlParser';
import { openTool } from '../utils';

const sql = `CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(30) COMMENT '用户名');
CREATE TABLE orders (id INT PRIMARY KEY, user_id INT NOT NULL, amount DECIMAL(10,2), CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id));`;

async function openTools(page: Page) {
  await page.route('**/api/parse-multi-sql', async (route) => {
    const payload: { sql: string; dbType: 'mysql' | 'postgresql'; strict?: boolean } = route
      .request()
      .postDataJSON();
    const result = await new SqlParser().parseMultiAsync(
      payload.sql,
      payload.dbType,
      payload.strict,
    );
    await route.fulfill({ json: result });
  });
  await page.goto('/');

  return openTool(page, '数据字典');
}

test('两份 SQL 支持重命名确认，并在输入变化后清除结果 @tools', async ({ page }) => {
  const dialog = await openTools(page);
  await openTool(page, '结构对比');
  await dialog
    .getByLabel('当前结构', { exact: true })
    .fill('CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(30));');
  await dialog
    .getByLabel('目标结构', { exact: true })
    .fill('CREATE TABLE users (id INT PRIMARY KEY, display_name VARCHAR(30));');
  await dialog.getByRole('button', { name: '比较结构' }).click();
  await dialog.getByLabel('将 name 重命名为').selectOption('display_name');
  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: '导出迁移 SQL' }).click();
  const content = await readFile(await (await downloadPromise).path(), 'utf8');
  expect(content).toContain('RENAME COLUMN');
  expect(content).not.toContain('DROP COLUMN');
  await dialog.getByLabel('目标结构', { exact: true }).fill('SELECT 1;');
  await expect(dialog.getByRole('button', { name: '导出迁移 SQL' })).toBeDisabled();
  await dialog.getByRole('button', { name: '比较结构' }).click();
  await expect(dialog.getByRole('alert')).toContainText('无法完整保留');
});

test('关联测试数据可重复导出，缺少父表时阻止生成 @tools', async ({ page }) => {
  await openTools(page);
  const dialog = await openTool(page, '关联测试数据');
  await dialog.getByLabel('数据来源', { exact: true }).selectOption('sql');
  await dialog.getByLabel('表结构 SQL', { exact: true }).fill(sql);
  await dialog.getByRole('button', { name: '解析 SQL', exact: true }).click();
  await dialog.getByLabel('users 的行数').fill('3');
  await dialog.getByLabel('orders 的行数').fill('12');
  await dialog.getByRole('button', { name: '生成测试数据' }).click();
  await expect(dialog.getByRole('status')).toContainText('15 行');
  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: '导出 INSERT SQL' }).click();
  const content = await readFile(await (await downloadPromise).path(), 'utf8');
  expect(content.indexOf('INSERT INTO users')).toBeLessThan(content.indexOf('INSERT INTO orders'));
  const secondDownload = page.waitForEvent('download');
  await dialog.getByRole('button', { name: '生成测试数据' }).click();
  await dialog.getByRole('button', { name: '导出 INSERT SQL' }).click();
  expect(await readFile(await (await secondDownload).path(), 'utf8')).toBe(content);
  await dialog.getByRole('checkbox', { name: /^users/ }).uncheck();
  await dialog.getByRole('button', { name: '生成测试数据' }).click();
  await expect(dialog.getByRole('alert')).toContainText('include referenced table');
  await expect(dialog.getByRole('button', { name: '导出 INSERT SQL' })).toBeDisabled();
});

test('结构快照可刷新并带出变化报告 @tools', async ({ page }, testInfo) => {
  const dialog = await openTools(page);
  await dialog.getByLabel('数据来源', { exact: true }).selectOption('sql');
  await dialog.getByLabel('表结构 SQL', { exact: true }).fill(sql);
  await dialog.getByRole('button', { name: '解析 SQL', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: '导出结构快照', exact: true }).click();
  const path = testInfo.outputPath('baseline.json');
  await (await downloadPromise).saveAs(path);
  await openTool(page, '结构刷新');
  await dialog.getByLabel('原有结构快照文件', { exact: true }).setInputFiles(path);
  await dialog.getByLabel('数据来源', { exact: true }).selectOption('sql');
  await dialog
    .getByLabel('表结构 SQL', { exact: true })
    .fill('CREATE TABLE users (id BIGINT PRIMARY KEY, email VARCHAR(100));');
  await dialog.getByRole('button', { name: '解析 SQL', exact: true }).click();
  await expect(dialog.getByText('新增表：—；移除表：orders', { exact: true })).toBeVisible();
  const refreshed = page.waitForEvent('download');
  await dialog.getByRole('button', { name: '下载刷新后的结构快照' }).click();
  expect(await readFile(await (await refreshed).path(), 'utf8')).toContain('BIGINT');
  await page.screenshot({ path: testInfo.outputPath('refresh-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('refresh-mobile.png') });
  const assessment = await openTool(page, '迁移兼容性');
  await assessment.getByLabel('数据来源', { exact: true }).selectOption('sql');
  await assessment
    .getByLabel('表结构 SQL', { exact: true })
    .fill('CREATE TABLE users (id BIGINT UNSIGNED, updated TIMESTAMP);');
  await assessment.getByRole('button', { name: '解析 SQL', exact: true }).click();
  const report = page.waitForEvent('download');
  await assessment.getByRole('button', { name: '导出兼容性报告' }).click();
  expect(await readFile(await (await report).path(), 'utf8')).toContain('numeric(20,0)');
});
