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

test('窄屏切换工具从顶部开始，并支持键盘导航 @tools', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const dialog = await openTools(page);
  await expect(dialog.getByRole('tab')).toHaveCount(11);
  await dialog.getByText('从表结构开始', { exact: true }).scrollIntoViewIfNeeded();
  await expect(dialog.getByRole('heading', { name: '数据字典', exact: true })).not.toBeInViewport();
  await dialog.getByRole('tab', { name: '关联测试数据', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: '关联测试数据', exact: true })).toBeInViewport();
  await dialog.getByRole('tab', { name: '关联测试数据', exact: true }).press('ArrowDown');
  await expect(dialog.getByRole('tab', { name: '业务数据导入', exact: true })).toBeFocused();
  await dialog.getByRole('tab', { name: '业务数据导入', exact: true }).press('Enter');
  await expect(dialog.getByRole('heading', { name: '业务数据导入', exact: true })).toBeInViewport();

  const width = await dialog.evaluate((element) => ({
    content: element.scrollWidth,
    viewport: element.clientWidth,
  }));
  expect(width.content).toBe(width.viewport);
});

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

test('结构快照可刷新并带出变化报告 @tools', async ({ page }, testInfo) => {
  const dialog = await openTools(page);
  await dialog.getByLabel('数据来源', { exact: true }).selectOption('sql');
  await dialog.getByLabel('表结构 SQL', { exact: true }).fill(sql);
  await dialog.getByRole('button', { name: '解析 SQL', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: '导出结构快照', exact: true }).click();
  const path = testInfo.outputPath('baseline.json');
  await (await downloadPromise).saveAs(path);
  await dialog.getByRole('tab', { name: '结构刷新', exact: true }).click();
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
  await expect(dialog.getByRole('tab', { name: '迁移兼容性' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('refresh-mobile.png') });
  await dialog.getByRole('tab', { name: '迁移兼容性' }).click();
  const assessment = dialog.getByRole('tabpanel', { name: '迁移兼容性' });
  await assessment.getByLabel('数据来源', { exact: true }).selectOption('sql');
  await assessment
    .getByLabel('表结构 SQL', { exact: true })
    .fill('CREATE TABLE users (id BIGINT UNSIGNED, updated TIMESTAMP);');
  await assessment.getByRole('button', { name: '解析 SQL', exact: true }).click();
  const report = page.waitForEvent('download');
  await assessment.getByRole('button', { name: '导出兼容性报告' }).click();
  expect(await readFile(await (await report).path(), 'utf8')).toContain('numeric(20,0)');
});

test('业务测试场景保存后可导入并重复生成 @tools', async ({ page }) => {
  const dialog = await openTools(page);
  await dialog.getByRole('tab', { name: '关联测试数据', exact: true }).click();
  const seed = dialog.getByRole('tabpanel', { name: '关联测试数据', exact: true });
  await seed.getByLabel('数据来源', { exact: true }).selectOption('sql');
  await seed.getByLabel('表结构 SQL', { exact: true }).fill(sql);
  await seed.getByRole('button', { name: '解析 SQL', exact: true }).click();
  await seed.getByText('业务测试场景', { exact: true }).click();
  await seed.getByLabel('场景名称', { exact: true }).fill('订单金额');
  await seed
    .getByRole('combobox', { name: '规则所属表', exact: true })
    .selectOption({ label: 'orders' });
  await seed.getByRole('combobox', { name: '规则字段', exact: true }).selectOption('amount');
  await seed.getByRole('combobox', { name: '生成方式', exact: true }).selectOption('range');
  await seed.getByLabel('最小值', { exact: true }).fill('12.34');
  await seed.getByLabel('最大值', { exact: true }).fill('12.34');
  await seed.getByRole('button', { name: '添加或替换字段规则', exact: true }).click();
  await seed.getByRole('button', { name: '保存场景', exact: true }).click();
  await expect(seed.getByText('场景已保存到当前浏览器。', { exact: true })).toBeVisible();
  await seed.getByRole('button', { name: '生成测试数据', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await seed.getByRole('button', { name: '导出 JSON', exact: true }).click();
  const content = await readFile(await (await downloadPromise).path(), 'utf8');
  expect(content).toContain('12.34');
  const scenarioPromise = page.waitForEvent('download');
  await seed.getByRole('button', { name: '导出场景 JSON', exact: true }).click();
  const scenario = await readFile(await (await scenarioPromise).path(), 'utf8');
  await seed.getByLabel('导入场景 JSON', { exact: true }).setInputFiles({
    name: 'scenario.json',
    mimeType: 'application/json',
    buffer: Buffer.from(scenario),
  });
  await expect(seed.getByRole('button', { name: '导出 JSON', exact: true })).toBeDisabled();
  await seed.getByRole('button', { name: '生成测试数据', exact: true }).click();
  const repeated = page.waitForEvent('download');
  await seed.getByRole('button', { name: '导出 JSON', exact: true }).click();
  expect(await readFile(await (await repeated).path(), 'utf8')).toBe(content);
});
