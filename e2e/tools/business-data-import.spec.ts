import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import type * as SheetJS from '../../apps/web/node_modules/xlsx';

const { utils, write }: typeof SheetJS = createRequire(
  new URL('../../apps/web/package.json', import.meta.url),
)('xlsx');

async function openImport(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '数据库工具', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: '数据库工具', exact: true });
  await dialog.getByRole('tab', { name: '业务数据导入', exact: true }).click();

  return dialog;
}

test('业务 CSV 在浏览器后台处理，下载完整脚本并可复用配置 @tools', async ({ page }) => {
  const sent: string[] = [];
  page.on('request', (request) => {
    if (request.postData()) sent.push(request.postData() ?? '');
  });
  const dialog = await openImport(page);
  await dialog
    .getByRole('combobox', { name: '目标数据库', exact: true })
    .selectOption('postgresql');
  await dialog.getByLabel('业务数据文件', { exact: true }).setInputFiles({
    name: 'orders.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'code,amount,note\n00123,9007199254740993.01,"PRIVATE_IMPORT_RECORD, O\'Brien"\n00124,0.10,"line one\nline two"',
    ),
  });
  await dialog.getByRole('button', { name: '读取数据', exact: true }).click();
  await expect(dialog.getByText('已读取 2 行、3 列')).toBeVisible();
  await dialog.getByLabel('目标表名', { exact: true }).fill('orders');
  await dialog.getByRole('button', { name: '校验全部数据并生成 SQL', exact: true }).click();
  await expect(dialog.getByText('2 行通过文件内校验')).toBeVisible();
  const sqlDownload = page.waitForEvent('download');
  await dialog.getByRole('button', { name: '下载完整 SQL', exact: true }).click();
  const sql = await readFile(await (await sqlDownload).path(), 'utf8');
  expect(sql).toContain("E'00123', 9007199254740993.01");
  expect(sql).toContain("O''Brien");
  expect(sql).toContain('CREATE TABLE');
  expect(sent.join('\n')).not.toContain('PRIVATE_IMPORT_RECORD');
  await dialog.getByText('复用导入配置', { exact: true }).click();
  await dialog.getByLabel('配置名称', { exact: true }).fill('每月订单');
  await dialog.getByRole('button', { name: '保存配置', exact: true }).click();
  const profileDownload = page.waitForEvent('download');
  await dialog.getByRole('button', { name: '导出配置 JSON', exact: true }).click();
  expect(await readFile(await (await profileDownload).path(), 'utf8')).not.toContain(
    'PRIVATE_IMPORT_RECORD',
  );
  await dialog.getByLabel('目标字段 1', { exact: true }).fill('changed');
  await expect(dialog.getByRole('button', { name: '下载完整 SQL', exact: true })).toHaveCount(0);
  await dialog.getByRole('combobox', { name: '已保存配置', exact: true }).selectOption('每月订单');
  await dialog.getByRole('button', { name: '应用配置', exact: true }).click();
  await expect(dialog.getByLabel('目标字段 1', { exact: true })).toHaveValue('code');
  await dialog.getByLabel('目标字段 1', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/ddlbuilder-business-import-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/ddlbuilder-business-import-mobile.png' });
  await dialog.getByRole('heading', { name: '1 · 读取业务数据' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/ddlbuilder-business-import-mobile-source.png' });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: '/tmp/ddlbuilder-business-import-dark.png' });
});

test('Excel 可跳过空工作表，并拒绝公式单元格 @tools', async ({ page }) => {
  const book = utils.book_new();
  utils.book_append_sheet(book, utils.aoa_to_sheet([]), 'Empty');
  utils.book_append_sheet(
    book,
    utils.aoa_to_sheet([
      ['code', 'amount'],
      ['00123', 19.9],
    ]),
    'Orders',
  );
  const formulas = utils.aoa_to_sheet([['value'], [2]]);
  formulas.A2.f = '1+1';
  utils.book_append_sheet(book, formulas, 'Formulas');
  const dialog = await openImport(page);
  await dialog.getByLabel('业务数据文件', { exact: true }).setInputFiles({
    name: 'orders.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: write(book, { type: 'buffer', bookType: 'xlsx', compression: true }),
  });
  await dialog.getByRole('button', { name: '读取数据', exact: true }).click();
  await dialog.getByRole('combobox', { name: 'Excel 工作表', exact: true }).selectOption('Orders');
  await expect(dialog.getByText('已读取 1 行、2 列')).toBeVisible();
  await dialog
    .getByRole('combobox', { name: 'Excel 工作表', exact: true })
    .selectOption('Formulas');
  await expect(dialog.getByRole('alert')).toContainText('A2 含公式');
  await expect(
    dialog.getByRole('button', { name: '校验全部数据并生成 SQL', exact: true }),
  ).toBeDisabled();
  await dialog.getByRole('combobox', { name: 'Excel 工作表', exact: true }).selectOption('Orders');
  await expect(dialog.getByText('已读取 1 行、2 列')).toBeVisible();
});

test('数据错误有源行号且输入变化立即使结果失效 @tools', async ({ page }) => {
  const dialog = await openImport(page);
  await dialog.getByRole('combobox', { name: '输入方式', exact: true }).selectOption('text');
  await dialog
    .getByRole('textbox', { name: '业务数据文本', exact: true })
    .fill('name\nAlice\nLongerName');
  await dialog.getByRole('button', { name: '读取数据', exact: true }).click();
  await dialog.getByLabel('SQL 类型 1', { exact: true }).fill('varchar(5)');
  await dialog.getByRole('button', { name: '校验全部数据并生成 SQL', exact: true }).click();
  await expect(dialog.getByText('发现 1 个问题，未生成 SQL')).toBeVisible();
  await expect(dialog.getByRole('button', { name: '下载完整 SQL', exact: true })).toBeDisabled();
  const errorsDownload = page.waitForEvent('download');
  await dialog.getByRole('button', { name: '下载完整错误 JSON', exact: true }).click();
  expect(JSON.parse(await readFile(await (await errorsDownload).path(), 'utf8'))).toEqual([
    expect.objectContaining({ line: 3, value: 'LongerName', code: 'length' }),
  ]);
  await page.screenshot({ path: '/tmp/ddlbuilder-business-import-errors.png' });
  await dialog.getByRole('textbox', { name: '业务数据文本', exact: true }).fill('other\nnew');
  await expect(dialog.getByRole('button', { name: '下载完整 SQL', exact: true })).toHaveCount(0);
  await expect(
    dialog.getByRole('button', { name: '校验全部数据并生成 SQL', exact: true }),
  ).toBeDisabled();
});
