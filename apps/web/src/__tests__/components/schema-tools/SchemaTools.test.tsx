import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, cleanup, screen, waitFor } from '@/__tests__/utils/test-utils';
import { DictionaryTool } from '@/components/schema-tools/DictionaryTool';
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
});
