import { describe, expect, it } from 'vitest';
import type { FieldRow, PersistedState } from '@ddlbuilder/shared-types';
import { mergeSchemaStates } from '@/services/schemaStateMerge';

const row = (id: string, overrides: Partial<FieldRow> = {}): FieldRow => ({
  id,
  order: 1,
  fieldName: id,
  fieldType: 'int',
  fieldComment: '',
  nullable: true,
  ...overrides,
});

const state = (overrides: Partial<PersistedState> = {}): PersistedState =>
  ({
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
    indexInput: '',
    currentIndexFields: [],
    indexes: [],
    authInput: '',
    authObjects: [],
    ...overrides,
  }) as PersistedState;

describe('mergeSchemaStates', () => {
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

  it('保留本地对索引等结构化字段的修改', () => {
    const indexes = [{ id: 'i1', name: 'idx_email', fields: [], unique: true }];
    const base = state();
    const local = state({ indexes });
    const remote = state({ tableName: 'accounts' });

    expect(mergeSchemaStates(base, local, remote).indexes).toEqual(indexes);
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

  it('远端删掉的行不会被本地修改带回来', () => {
    const base = state();
    const local = state({ rows: [row('a'), row('b', { fieldType: 'bigint' })] });
    const remote = state({ rows: [row('a')] });

    expect(mergeSchemaStates(base, local, remote).rows.map((r) => r.id)).toEqual(['a']);
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

  it('远端未修改被删行时保留本地删除', () => {
    const base = state();
    const local = state({ rows: [row('a')] });
    const remote = state({ tableComment: '远端注释' });

    expect(mergeSchemaStates(base, local, remote).rows.map((r) => r.id)).toEqual(['a']);
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

  it('远端未重排时保留本地行顺序', () => {
    const base = state();
    const local = state({ rows: [row('b'), row('a')] });
    const remote = state({ tableComment: '远端注释' });

    expect(mergeSchemaStates(base, local, remote).rows.map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('保留本地对行内每一个可选键的修改', () => {
    const base = state({ rows: [row('a')] });
    const local = state({
      rows: [row('a', { defaultKind: 'uuid', defaultValue: 'x', enumMeta: [{ value: '1' }] })],
    });
    const remote = state({ rows: [row('a', { fieldComment: '远端注释' })] });

    const merged = mergeSchemaStates(base, local, remote);

    expect(merged.rows[0]).toMatchObject({
      defaultKind: 'uuid',
      defaultValue: 'x',
      enumMeta: [{ value: '1' }],
      fieldComment: '远端注释',
    });
  });
});
