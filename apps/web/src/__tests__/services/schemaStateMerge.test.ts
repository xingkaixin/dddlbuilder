import { describe, expect, it } from 'vitest';
import type { FieldRow, PersistedState } from '@ddlbuilder/shared-types';
import { mergeSchemaStates } from '@/services/schemaStateMerge';
import { updateDocumentFields } from '@/stores/editorDocumentMutations';

const row = (id: string, overrides: Partial<FieldRow> = {}): FieldRow => ({
  id,
  fieldName: id,
  fieldType: 'int',
  fieldComment: '',
  nullable: true,
  ...overrides,
});

const state = (overrides: Partial<PersistedState> = {}): PersistedState => ({
  objectType: 'table',
  schemaName: '',
  tableName: 'users',
  tableComment: '',
  dbType: 'mysql',
  sqlFormatMode: 'compact',
  viewDefinition: '',
  viewCreateOrReplace: true,
  rows: [row('a'), row('b')],
  addCount: 10,
  indexes: [],
  authInput: '',
  authObjects: [],
  ...overrides,
});

describe('mergeSchemaStates', () => {
  it.each([true, false])('字段改名与独立新增索引合并后仍指向同一字段 (%s)', (preferRename) => {
    const base = state({
      indexes: [
        { id: 'existing', name: 'idx_a', fields: [{ name: 'a', direction: 'ASC' }], kind: 'index' },
      ],
    });
    const renamed = updateDocumentFields(base, [row('a', { fieldName: 'account_id' }), row('b')]);

    const indexed: PersistedState = {
      ...base,
      indexes: [
        ...base.indexes,
        {
          id: 'new',
          name: 'idx_b_a',
          fields: [
            { name: 'b', direction: 'ASC' as const },
            { name: 'a', direction: 'DESC' as const },
          ],
          kind: 'index',
        },
      ],
    };
    const merged = preferRename
      ? mergeSchemaStates(base, indexed, renamed)
      : mergeSchemaStates(base, renamed, indexed);
    expect(merged.indexes).toEqual([
      {
        ...base.indexes[0],
        name: 'idx_account_id',
        fields: [{ name: 'account_id', direction: 'ASC' }],
      },
      {
        ...indexed.indexes[1],
        name: 'idx_b_account_id',
        fields: [
          { name: 'b', direction: 'ASC' },
          { name: 'account_id', direction: 'DESC' },
        ],
      },
    ]);
    expect(merged.rows.map((field) => field.fieldName)).toEqual(['account_id', 'b']);
    expect(indexed.indexes[1].fields[1].name).toBe('a');
  });

  it('改名同步调整独立新增的外键、分区和分布字段引用', () => {
    const base = state();
    const renamed = updateDocumentFields(base, [row('a', { fieldName: 'account_id' }), row('b')]);

    const configured = state({
      foreignKeys: [
        { id: 'self', name: 'self', fields: ['b'], refTable: 'users', refFields: ['a'] },
        { id: 'external', name: 'external', fields: ['a'], refTable: 'other', refFields: ['a'] },
      ],
      mysqlPartitionConfig: {
        enabled: true,
        type: 'HASH',
        columns: [],
        expression: "a + LENGTH('a')",
        partitionCount: 4,
      },
      citusShardingConfig: { mode: 'distributed', distributionColumn: 'a' },
      tableMiscConfig: {
        enabled: true,
        partitions: {
          enabled: true,
          columns: [],
          clustering: { enabled: true, columns: ['a'], bucketCount: 4 },
        },
      },
    });
    const merged = mergeSchemaStates(base, configured, renamed);
    expect(merged.foreignKeys).toMatchObject([
      { id: 'self', fields: ['b'], refTable: 'users', refFields: ['account_id'] },
      { id: 'external', fields: ['account_id'], refTable: 'other', refFields: ['a'] },
    ]);
    expect(merged.mysqlPartitionConfig?.expression).toBe("account_id + LENGTH('a')");
    expect(merged.citusShardingConfig?.distributionColumn).toBe('account_id');
    expect(merged.tableMiscConfig?.partitions?.clustering?.columns).toEqual(['account_id']);
  });

  it.each([true, false])('删除字段时清理另一端独立新增的引用 (%s)', (preferDeletion) => {
    const base = state();
    const removed = state({ rows: [row('b')] });

    const configured = state({
      indexes: [
        { id: 'a', name: 'idx_a', fields: [{ name: 'a', direction: 'ASC' }], kind: 'index' },
        { id: 'b', name: 'idx_b', fields: [{ name: 'b', direction: 'ASC' }], kind: 'index' },
      ],
      foreignKeys: [
        { id: 'self', name: 'self', fields: ['b'], refTable: 'users', refFields: ['a'] },
      ],
      mysqlPartitionConfig: { enabled: true, type: 'HASH', columns: ['a'], partitionCount: 4 },
    });
    const merged = preferDeletion
      ? mergeSchemaStates(base, configured, removed)
      : mergeSchemaStates(base, removed, configured);
    expect(merged.rows.map((field) => field.id)).toEqual(['b']);
    expect(merged.indexes).toEqual([configured.indexes[1]]);
    expect(merged.foreignKeys).toEqual([]);
    expect(merged.mysqlPartitionConfig).toMatchObject({ enabled: false, columns: [] });
  });

  it('保留本地改过而远端没动的标量', () => {
    const base = state();
    const local = state({ tableComment: '用户表', dbType: 'postgresql' });
    const remote = state({ tableName: 'accounts' });

    const merged = mergeSchemaStates(base, local, remote);

    expect(merged.tableComment).toBe('用户表');
    expect(merged.dbType).toBe('postgresql');
    expect(merged.tableName).toBe('accounts');
  });

  it('两端改同一个键时远端赢', () => {
    const base = state();
    const local = state({ tableName: 'local' });
    const remote = state({ tableName: 'remote' });

    expect(mergeSchemaStates(base, local, remote).tableName).toBe('remote');
  });

  it('远端插入行后本地的字段修改仍落在原来那一行', () => {
    const base = state();
    const local = state({ rows: [row('a'), row('b', { fieldComment: '本地注释' })] });
    const remote = state({ rows: [row('c'), row('a'), row('b')] });

    const merged = mergeSchemaStates(base, local, remote);

    expect(merged.rows.map((r) => [r.id, r.fieldComment])).toEqual([
      ['c', ''],
      ['a', ''],
      ['b', '本地注释'],
    ]);
  });

  it('远端只改标量时保留本地新增行及其位置', () => {
    const base = state();
    const local = state({ rows: [row('a'), row('local-new'), row('b')] });
    const remote = state({ tableComment: '远端注释' });

    expect(mergeSchemaStates(base, local, remote).rows.map((r) => r.id)).toEqual([
      'a',
      'local-new',
      'b',
    ]);
  });

  it('本地删除与远端行修改冲突时保留远端行', () => {
    const base = state();
    const local = state({ rows: [row('a')] });
    const remote = state({ rows: [row('a'), row('b', { fieldComment: '远端注释' })] });

    expect(mergeSchemaStates(base, local, remote).rows).toEqual([
      row('a'),
      row('b', { fieldComment: '远端注释' }),
    ]);
  });
});
