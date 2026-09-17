import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { SqlParser } from '../../packages/ddl-core/src/parser/SqlParser';

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
  await page.getByRole('button', { name: '数据库工具', exact: true }).first().click();

  return page.getByRole('dialog', { name: '数据库工具', exact: true });
}

test('数据字典可直接从 SQL 导出并离线搜索 @tools', async ({ page, context }, testInfo) => {
  const dialog = await openTools(page);
  await dialog.getByLabel('数据来源', { exact: true }).selectOption('sql');
  await dialog.getByLabel('表结构 SQL', { exact: true }).fill(sql);
  await dialog.getByRole('button', { name: '解析 SQL', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'users', exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: '导出离线 HTML' }).click();
  const download = await downloadPromise;
  const path = testInfo.outputPath('dictionary.html');
  await download.saveAs(path);
  const offline = await context.newPage();
  await offline.goto(pathToFileURL(path).href);
  await expect(offline.getByRole('heading', { name: 'users', exact: true })).toBeVisible();
  await offline.getByLabel('搜索表名、字段或业务说明').fill('用户名');
  await expect(offline.getByRole('heading', { name: 'orders', exact: true })).toBeHidden();
  await expect(offline.getByRole('heading', { name: 'users', exact: true })).toBeVisible();
  await offline.getByLabel('搜索表名、字段或业务说明').fill('amount');
  await expect(offline.getByRole('heading', { name: 'users', exact: true })).toBeHidden();
  await offline.getByRole('link', { name: 'users (id)', exact: true }).click();
  await expect(offline.getByRole('heading', { name: 'users', exact: true })).toBeVisible();
  await offline.close();
  await page.screenshot({ path: '/tmp/ddlbuilder-schema-tools-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: '/tmp/ddlbuilder-schema-tools-mobile.png' });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: '/tmp/ddlbuilder-schema-tools-dark.png' });
});

test('两份 SQL 支持重命名确认，并在输入变化后清除结果 @tools', async ({ page }) => {
  const dialog = await openTools(page);
  await dialog.getByRole('tab', { name: '结构对比', exact: true }).click();
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
  const tools = await openTools(page);
  await tools.getByRole('tab', { name: '关联测试数据', exact: true }).click();
  const dialog = tools.getByRole('tabpanel', { name: '关联测试数据', exact: true });
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
