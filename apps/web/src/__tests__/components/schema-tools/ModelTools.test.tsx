import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, cleanup, screen, waitFor } from '@/__tests__/utils/test-utils';
import { setupSchemaTools, renderTool as render, jsonFile } from '@/__tests__/utils/schemaTools';
import { QueryDesignerTool } from '@/components/schema-tools/QueryDesignerTool';
import { BusinessModuleTool } from '@/components/schema-tools/BusinessModuleTool';
import { SqliteExportTool } from '@/components/schema-tools/SqliteExportTool';
import { FieldImpactTool } from '@/components/schema-tools/FieldImpactTool';
import {
  instantiateBusinessModule,
  snapshotTableKey,
  getQueryRelations,
} from '@ddlbuilder/ddl-core';
import { encodeDeliverySnapshot } from '@ddlbuilder/workspace-core';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { listSavedTables } from '@/utils/savedTablesDb';
import { getAnonymousWorkspaceScope } from '@/utils/workspaceScope';

let harness: ReturnType<typeof setupSchemaTools>;
const models = () => instantiateBusinessModule('rbac', 'mysql', '', 'integer');
const fieldValue = (table: PersistedState, field: string) =>
  JSON.stringify([snapshotTableKey(table), field]);

async function loadSnapshot(tables: PersistedState[]) {
  fireEvent.change(screen.getByLabelText('数据来源'), { target: { value: 'snapshot' } });
  fireEvent.change(screen.getByLabelText('结构快照 JSON'), {
    target: { files: [jsonFile(encodeDeliverySnapshot({ tables, standards: [] }))] },
  });
  await screen.findByRole('checkbox', { name: new RegExp(`^${tables[0].tableName}`) });
}

beforeEach(() => {
  harness = setupSchemaTools();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('modeling tool workflows', () => {
  it('builds a parameterized join, groups aggregates and invalidates output on source changes', async () => {
    render(<QueryDesignerTool />);
    const tables = models();
    await loadSnapshot(tables);
    fireEvent.change(screen.getByLabelText('根表'), {
      target: { value: snapshotTableKey(tables[0]) },
    });
    fireEvent.change(screen.getByLabelText('添加连接关系'), {
      target: { value: getQueryRelations(tables)[0].id },
    });
    fireEvent.change(screen.getByLabelText('连接 1 的类型'), { target: { value: 'LEFT' } });
    fireEvent.click(screen.getByRole('button', { name: '添加输出字段' }));
    fireEvent.change(screen.getByLabelText('输出字段 1'), {
      target: { value: fieldValue(tables[0], 'username') },
    });
    fireEvent.change(screen.getByLabelText('别名 1'), { target: { value: 'login' } });
    fireEvent.click(screen.getByRole('button', { name: '添加过滤条件' }));
    fireEvent.change(screen.getByLabelText('过滤字段 1'), {
      target: { value: fieldValue(tables[0], 'username') },
    });
    fireEvent.change(screen.getByLabelText('运算符 1'), { target: { value: 'LIKE' } });
    fireEvent.change(screen.getByLabelText('参数值 1'), { target: { value: "O'Reilly%" } });
    fireEvent.click(screen.getByRole('button', { name: '添加排序' }));
    fireEvent.change(screen.getByLabelText('排序方向 1'), { target: { value: 'DESC' } });
    fireEvent.change(screen.getByLabelText('LIMIT'), { target: { value: '25' } });
    expect(screen.getByLabelText('查询 SQL')).toHaveTextContent('LEFT JOIN');
    expect(screen.getByLabelText('查询 SQL')).toHaveTextContent('LIKE ?');
    expect(screen.getByLabelText('查询 SQL')).not.toHaveTextContent("O'Reilly");
    fireEvent.click(screen.getByRole('button', { name: '下载参数 JSON' }));
    expect(await harness.lastDownload()).toEqual({
      name: 'parameters.json',
      text: JSON.stringify(["O'Reilly%"], null, 2),
    });
    fireEvent.click(screen.getByRole('button', { name: '添加输出字段' }));
    fireEvent.change(screen.getByLabelText('输出字段 2'), {
      target: { value: fieldValue(tables[0], '*') },
    });
    expect(screen.getByRole('alert')).toHaveTextContent('must be grouped');
    fireEvent.click(screen.getByRole('checkbox', { name: 'users.username' }));
    expect(screen.getByLabelText('查询 SQL')).toHaveTextContent('COUNT(*)');
    fireEvent.click(screen.getByRole('button', { name: '下载 SQL' }));
    expect(await harness.lastDownload()).toMatchObject({
      name: 'query.sql',
      text: expect.stringContaining('GROUP BY'),
    });
    fireEvent.change(screen.getByLabelText('运算符 1'), { target: { value: 'IS NULL' } });
    expect(screen.getByLabelText('查询参数')).toHaveTextContent('[]');
    fireEvent.click(screen.getByRole('button', { name: '移除此连接及后续配置' }));
    expect(screen.queryByLabelText('查询 SQL')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '清空选择' }));
    expect(screen.getByLabelText('根表')).toHaveValue('');
  });

  it('rejects unsupported query dialects', async () => {
    render(<QueryDesignerTool />);
    await loadSnapshot(models().map((table) => ({ ...table, dbType: 'sqlite' })));
    expect(screen.getByRole('alert')).toHaveTextContent('MySQL');
    expect(screen.queryByRole('button', { name: '下载 SQL' })).not.toBeInTheDocument();
  });

  it('saves an entire module once, prevents conflicts and exports configured snapshots', async () => {
    render(<BusinessModuleTool />);
    const save = screen.getByRole('button', { name: '保存整组到工作区' });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    expect(await screen.findByRole('status')).toHaveTextContent('已保存 5 张表');
    fireEvent.click(save);
    expect(await screen.findByRole('alert')).toHaveTextContent('没有覆盖现有表');
    expect(await listSavedTables(getAnonymousWorkspaceScope())).toHaveLength(5);
    fireEvent.change(screen.getByLabelText('业务模块类型'), { target: { value: 'booking' } });
    fireEvent.change(screen.getByLabelText('数据库'), { target: { value: 'postgresql' } });
    fireEvent.change(screen.getByLabelText('主键方案'), { target: { value: 'string' } });
    fireEvent.change(screen.getByLabelText('表名前缀'), { target: { value: 'app_' } });
    fireEvent.click(screen.getByRole('button', { name: '下载 SQL' }));
    expect(await harness.lastDownload()).toMatchObject({
      text: expect.stringContaining('app_bookings'),
      name: 'booking.sql',
    });
    fireEvent.click(screen.getByRole('button', { name: '导出结构快照' }));
    expect(await harness.lastDownload()).toMatchObject({
      text: expect.stringContaining('varchar(36)'),
      name: 'booking.json',
    });
    fireEvent.change(screen.getByLabelText('表名前缀'), { target: { value: 'Invalid-' } });
    expect(screen.getByRole('alert')).toHaveTextContent('prefix');
    expect(save).toBeDisabled();
  });

  it('exports complete SQLite projects and blocks missing referenced tables', async () => {
    render(<SqliteExportTool />);
    const tables = models().map((table): PersistedState => ({ ...table, dbType: 'sqlite' }));
    await loadSnapshot(tables);
    fireEvent.click(screen.getByRole('button', { name: '下载初始化 SQL' }));
    expect(await harness.lastDownload()).toMatchObject({
      name: '0001_init.sql',
      text: expect.stringContaining('AUTOINCREMENT'),
    });
    fireEvent.click(screen.getByRole('button', { name: '下载 Drizzle schema' }));
    expect(await harness.lastDownload()).toMatchObject({
      name: 'schema.ts',
      text: expect.stringContaining('foreignKey('),
    });
    fireEvent.click(screen.getByRole('button', { name: '下载使用说明' }));
    expect(await harness.lastDownload()).toMatchObject({
      name: 'README.md',
      text: expect.stringContaining('--local'),
    });
    fireEvent.click(screen.getByRole('checkbox', { name: /^users/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('referenced table');
    expect(screen.queryByRole('button', { name: '下载初始化 SQL' })).not.toBeInTheDocument();
  });

  it('lets wide schemas target SQLite while blocking D1 exports', async () => {
    render(<SqliteExportTool />);

    const table: PersistedState = {
      ...models()[0],
      dbType: 'sqlite',
      indexes: [],
      rows: Array.from({ length: 101 }, (_, i) => ({
        id: String(i),
        fieldName: `f${i}`,
        fieldType: 'text',
        fieldComment: '',
        nullable: true,
      })),
    };
    await loadSnapshot([table]);
    expect(screen.getByRole('alert')).toHaveTextContent('100 columns');
    expect(screen.queryByRole('button', { name: '下载初始化 SQL' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('导出目标'), { target: { value: 'sqlite' } });
    fireEvent.click(screen.getByRole('button', { name: '下载初始化 SQL' }));
    expect(await harness.lastDownload()).toMatchObject({ text: expect.stringContaining('f100') });
  });

  it('reports field dependencies and clears the result when the scope changes', async () => {
    render(<FieldImpactTool />);
    const tables = models();
    await loadSnapshot(tables);
    fireEvent.change(screen.getByLabelText('目标表'), {
      target: { value: snapshotTableKey(tables[0]) },
    });
    fireEvent.change(screen.getByLabelText('目标字段'), { target: { value: 'id' } });
    expect(screen.getByRole('status')).toHaveTextContent('已检查 5 张表');
    expect(screen.getByText('其他字段引用此字段')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '下载影响报告' }));
    expect(await harness.lastDownload()).toMatchObject({
      name: 'field-impact.md',
      text: expect.stringContaining('user_roles'),
    });
    fireEvent.click(screen.getByRole('checkbox', { name: /^roles/ }));
    expect(screen.queryByRole('button', { name: '下载影响报告' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('目标字段')).toBeDisabled();
  });
});
