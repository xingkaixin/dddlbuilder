import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, cleanup, screen, waitFor, within } from '@/__tests__/utils/test-utils';
import { SchemaToolsButton } from '@/components/schema-tools/SchemaToolsButton';
import { DictionaryTool } from '@/components/schema-tools/DictionaryTool';
import { SchemaCompareTool } from '@/components/schema-tools/SchemaCompareTool';
import { RelationalSeedTool } from '@/components/schema-tools/RelationalSeedTool';
import { parseSqlSnapshot } from '@/components/schema-tools/sqlSnapshot';

import { setupSchemaTools, renderTool as render } from '@/__tests__/utils/schemaTools';
import { addSavedTable, updateSavedTable } from '@/utils/savedTablesDb';
import { getAnonymousWorkspaceScope } from '@/utils/workspaceScope';

let harness: ReturnType<typeof setupSchemaTools>;

const sql = `CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(30) COMMENT '用户名');
CREATE TABLE orders (id INT PRIMARY KEY, user_id INT NOT NULL,
CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id));`;

async function enterSql(value = sql) {
  fireEvent.change(screen.getByLabelText('数据来源'), { target: { value: 'sql' } });
  fireEvent.change(screen.getByLabelText('表结构 SQL'), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: '解析 SQL' }));
  await screen.findByRole('checkbox', { name: /^users/ });
}

beforeEach(() => {
  harness = setupSchemaTools();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('database tool workflows', () => {
  it('opens tools from an empty workspace and closes the dialog', async () => {
    render(<SchemaToolsButton />);
    fireEvent.click(screen.getByRole('button', { name: '数据库工具' }));
    const dialog = await screen.findByRole('dialog', { name: '数据库工具' });
    fireEvent.click(within(dialog).getByRole('tab', { name: '结构对比' }));
    expect(screen.getByLabelText('当前结构')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: /close/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('exports all selected tables even when the dictionary is filtered', async () => {
    render(<DictionaryTool />);
    await enterSql();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '用户名' } });
    expect(screen.getByRole('heading', { name: 'users' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'orders' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('文档标题'), { target: { value: '交接文档' } });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '导出 Markdown' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: '导出 Markdown' }));
    expect(await harness.lastDownload()).toMatchObject({
      text: expect.stringContaining('orders'),
      name: 'database-dictionary.md',
    });
    fireEvent.click(screen.getByRole('button', { name: '导出离线 HTML' }));
    expect(await harness.lastDownload()).toMatchObject({
      text: expect.stringContaining('交接文档'),
      name: 'database-dictionary.html',
    });
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'orders' } });
    fireEvent.click(screen.getByRole('link', { name: 'users (id)' }));
    expect(screen.getByRole('heading', { name: 'users' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: /^users/ }));
    expect(screen.queryByRole('heading', { name: 'users' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '全选' }));
    expect(screen.getByRole('heading', { name: 'users' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '清空选择' }));
    expect(screen.getByRole('button', { name: '导出离线 HTML' })).toBeDisabled();
  });

  it('refreshes selected saved tables and prevents exports after SQL changes', async () => {
    const tables = await parseSqlSnapshot(sql, 'mysql');

    const records = tables.map((state) => ({
      state,
      name: state.tableName,
      normalizedName: state.tableName,
      createdAt: 1,
      updatedAt: 1,
    }));

    for (const record of records) await addSavedTable(record, getAnonymousWorkspaceScope());
    render(<DictionaryTool />);
    fireEvent.click(await screen.findByRole('checkbox', { name: /^users/ }));
    await updateSavedTable(
      { ...records[0], state: { ...records[0].state, tableComment: '更新的说明' } },
      getAnonymousWorkspaceScope(),
    );
    fireEvent.click(screen.getByRole('button', { name: '重新读取' }));
    await screen.findAllByText('更新的说明');
    expect(screen.getByRole('heading', { name: 'users' })).toBeInTheDocument();
    await enterSql();
    fireEvent.change(screen.getByLabelText('表结构 SQL'), { target: { value: 'SELECT 1;' } });
    expect(screen.getByRole('button', { name: '导出 Markdown' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '解析 SQL' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('无法完整保留');
  });

  it('blocks dictionary exports when standards cannot be loaded and supports retry', async () => {
    vi.spyOn(indexedDB, 'open').mockImplementationOnce(() => {
      throw new Error('unavailable');
    });
    render(<DictionaryTool />);
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: '导出 Markdown' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('exports confirmed renames and invalidates results when input or dialect changes', async () => {
    render(<SchemaCompareTool />);
    fireEvent.change(screen.getByLabelText('当前结构'), {
      target: { value: 'CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(30));' },
    });
    fireEvent.change(screen.getByLabelText('目标结构'), {
      target: { value: 'CREATE TABLE users (id INT PRIMARY KEY, display_name VARCHAR(30));' },
    });
    fireEvent.click(screen.getByRole('button', { name: '比较结构' }));
    fireEvent.change(await screen.findByLabelText('将 name 重命名为'), {
      target: { value: 'display_name' },
    });
    fireEvent.click(screen.getByRole('button', { name: '导出迁移 SQL' }));
    expect(await harness.lastDownload()).toMatchObject({
      text: expect.stringContaining('RENAME COLUMN'),
      name: 'schema-migration.sql',
    });
    fireEvent.click(screen.getByRole('button', { name: '导出对比报告' }));
    expect(await harness.lastDownload()).toMatchObject({
      text: expect.stringContaining('重命名'),
      name: 'schema-comparison.md',
    });
    fireEvent.change(screen.getByLabelText('数据库'), { target: { value: 'postgresql' } });
    expect(screen.getByRole('button', { name: '导出迁移 SQL' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('目标结构'), { target: { value: 'SELECT 1;' } });
    fireEvent.click(screen.getByRole('button', { name: '比较结构' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('无法完整保留');
  });

  it('generates repeatable related rows and blocks missing parents', async () => {
    render(<RelationalSeedTool />);
    await enterSql();
    fireEvent.change(screen.getByLabelText('users 的行数'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('orders 的行数'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: '生成测试数据' }));
    expect(screen.getByRole('status')).toHaveTextContent('15 行');
    fireEvent.click(screen.getByRole('button', { name: '导出 INSERT SQL' }));
    const first = await harness.lastDownload();
    fireEvent.click(screen.getByRole('button', { name: '生成测试数据' }));
    fireEvent.click(screen.getByRole('button', { name: '导出 INSERT SQL' }));
    expect(await harness.lastDownload()).toEqual(first);
    fireEvent.click(screen.getByRole('button', { name: '导出 JSON' }));
    expect(await harness.lastDownload()).toMatchObject({
      text: expect.stringContaining('orders'),
      name: 'relational-test-data.json',
    });
    fireEvent.click(screen.getByRole('checkbox', { name: /^users/ }));
    fireEvent.click(screen.getByRole('button', { name: '生成测试数据' }));
    expect(screen.getByRole('alert')).toHaveTextContent('include referenced table');
    expect(screen.getByRole('button', { name: '导出 INSERT SQL' })).toBeDisabled();
  });

  it('rejects oversized uploads and clears previous SQL', async () => {
    render(<DictionaryTool />);
    await enterSql();
    const file = new File(['x'.repeat(200001)], 'large.sql');
    fireEvent.change(screen.getByLabelText('上传表结构 SQL文件'), { target: { files: [file] } });
    await screen.findByRole('alert');
    expect(screen.getByLabelText('表结构 SQL')).toHaveValue('');
    expect(screen.getByRole('button', { name: '导出 Markdown' })).toBeDisabled();
  });
});
