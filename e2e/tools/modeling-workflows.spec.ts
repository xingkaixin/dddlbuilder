import { test, expect, type Page, type Locator } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { instantiateBusinessModule, snapshotTableKey } from '../../packages/ddl-core/src/index';
import { encodeDeliverySnapshot } from '../../packages/workspace-core/src/index';
import type { PersistedState } from '../../packages/shared-types/src/index';
import { setupHydratedState } from '../utils';

async function openTool(page: Page, name: string) {
  await page.goto('/');
  await page.getByRole('button', { name: '数据库工具', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: '数据库工具', exact: true });
  await dialog.getByRole('tab', { name, exact: true }).click();

  return dialog.getByRole('tabpanel', { name, exact: true });
}

async function loadSnapshot(dialog: Locator, tables: PersistedState[]) {
  await dialog.getByLabel('数据来源', { exact: true }).selectOption('snapshot');
  await dialog.getByLabel('结构快照 JSON', { exact: true }).setInputFiles({
    name: 'schema.json',
    mimeType: 'application/json',
    buffer: Buffer.from(encodeDeliverySnapshot({ tables, standards: [] })),
  });
  await expect(
    dialog.getByRole('checkbox', { name: new RegExp(`^${tables[0].tableName}`) }),
  ).toBeChecked();
}

async function downloadText(page: Page, button: Locator) {
  const pending = page.waitForEvent('download');
  await button.click();

  return readFile(await (await pending).path(), 'utf8');
}

test('查询设计支持 JOIN、独立参数与来源失效 @tools', async ({ page }) => {
  const dialog = await openTool(page, '查询设计');
  const tables = instantiateBusinessModule('rbac', 'postgresql', '', 'integer');
  await loadSnapshot(dialog, tables);
  await dialog
    .getByRole('combobox', { name: '根表', exact: true })
    .selectOption({ label: 'users' });
  await dialog.getByLabel('添加连接关系', { exact: true }).selectOption({ index: 1 });
  await dialog.getByLabel('连接 1 的类型').selectOption('LEFT');
  await dialog.getByRole('button', { name: '添加输出字段', exact: true }).click();
  await dialog.getByLabel('输出字段 1', { exact: true }).selectOption({ label: 'users.username' });
  await dialog.getByRole('button', { name: '添加过滤条件', exact: true }).click();
  await dialog.getByLabel('过滤字段 1').selectOption({ label: 'users.username' });
  await dialog.getByLabel('参数值 1').fill("O'Reilly");

  const sql = await downloadText(
    page,
    dialog.getByRole('button', { name: '下载 SQL', exact: true }),
  );
  expect(sql).toContain('LEFT JOIN');
  expect(sql).toContain('$1');
  expect(sql).not.toContain("O'Reilly");

  const parameters = await downloadText(
    page,
    dialog.getByRole('button', { name: '下载参数 JSON', exact: true }),
  );
  expect(JSON.parse(parameters)).toEqual(["O'Reilly"]);
  await page.screenshot({ path: '/tmp/ddlbuilder-query-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '/tmp/ddlbuilder-query-mobile.png' });
  await dialog.getByRole('button', { name: '清空选择', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '下载 SQL', exact: true })).toHaveCount(0);
});

test('业务模块整组保存并在刷新后拒绝重复保存 @tools', async ({ page }) => {
  const dialog = await openTool(page, '业务模块');
  await dialog.getByLabel('表名前缀').fill('demo_');
  await dialog.getByRole('button', { name: '保存整组到工作区', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('已保存 5 张表');

  const snapshot = await downloadText(
    page,
    dialog.getByRole('button', { name: '导出结构快照', exact: true }),
  );
  expect(snapshot).toContain('demo_user_roles');
  const reopened = await openTool(page, '业务模块');
  await reopened.getByLabel('表名前缀').fill('demo_');
  await reopened.getByRole('button', { name: '保存整组到工作区', exact: true }).click();
  await expect(reopened.getByRole('alert')).toContainText('没有覆盖现有表');
  await page.getByRole('tab', { name: '影响分析', exact: true }).click();
  await expect(
    page.getByRole('tabpanel', { name: '影响分析', exact: true }).getByRole('checkbox'),
  ).toHaveCount(5);
});

test('SQLite 初始化导出保留约束并阻止不完整选集 @tools', async ({ page }) => {
  const dialog = await openTool(page, 'SQLite / D1 导出');

  const tables = instantiateBusinessModule('rbac', 'mysql', '', 'integer').map(
    (table): PersistedState => ({ ...table, dbType: 'sqlite' }),
  );
  await loadSnapshot(dialog, tables);
  const sql = await downloadText(page, dialog.getByRole('button', { name: '下载初始化 SQL' }));
  expect(sql).toContain('PRIMARY KEY AUTOINCREMENT');
  expect(sql).toContain('FOREIGN KEY');
  expect(sql).not.toContain('ALTER TABLE');

  const drizzle = await downloadText(
    page,
    dialog.getByRole('button', { name: '下载 Drizzle schema' }),
  );
  expect(drizzle).toContain('drizzle-orm/sqlite-core');
  expect(drizzle).toContain('foreignKey(');
  await dialog.getByRole('checkbox', { name: /^users/ }).uncheck();
  await expect(dialog.getByRole('alert')).toContainText('referenced table');
  await expect(dialog.getByRole('button', { name: '下载初始化 SQL' })).toHaveCount(0);
});

test('字段影响报告包含关系与分析范围 @tools', async ({ page }) => {
  const dialog = await openTool(page, '影响分析');
  const tables = instantiateBusinessModule('inventory', 'mysql', '', 'integer');
  await loadSnapshot(dialog, tables);
  await dialog.getByLabel('目标表').selectOption(snapshotTableKey(tables[0]));
  await dialog.getByLabel('目标字段').selectOption('id');
  await expect(dialog.getByRole('status')).toContainText('已检查 4 张表');
  const report = await downloadText(page, dialog.getByRole('button', { name: '下载影响报告' }));
  expect(report).toContain('stock');
  expect(report).toContain('数据库外键约束');
  expect(report).toContain('未发现依赖不代表修改安全');
  await page.screenshot({ path: '/tmp/ddlbuilder-impact-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '/tmp/ddlbuilder-impact-mobile.png' });
  await dialog.getByRole('button', { name: '清空选择', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '下载影响报告' })).toHaveCount(0);
});

test('SQLite 编辑器生成原生类型并自动选择 Drizzle @core', async ({ page }) => {
  await page.goto('/');
  await setupHydratedState(page);
  await page.getByTestId('db-type-selector').click();
  await page.getByRole('option', { name: 'SQLite / D1', exact: true }).click();
  await expect(
    page.getByRole('tabpanel', { name: '建表 DDL', exact: true }).locator('pre'),
  ).toContainText('"HYDRATED_FIELD" INTEGER');
  await expect(page.getByRole('tab', { name: '授权 DCL', exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: 'ORM 模型', exact: true }).click();
  await expect(page.getByRole('tabpanel', { name: 'ORM 模型' }).locator('pre')).toContainText(
    'sqliteTable',
  );
  await expect(page.locator('#orm-target')).toContainText('Drizzle');
});
