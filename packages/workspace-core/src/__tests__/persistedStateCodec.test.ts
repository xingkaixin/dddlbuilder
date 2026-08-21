import { describe, expect, it } from 'vitest';
import { decodePersistedState, decodeWorkspaceSnapshot } from '../persistedStateCodec';

const externalState = () => ({
  tableName: 'users',
  tableComment: '',
  dbType: 'mysql',
  rows: [],
  addCount: 10,
  indexInput: '',
  currentIndexFields: [],
  indexes: [],
  authInput: '',
  authObjects: [],
});

describe('decodePersistedState', () => {
  it('兼容旧的限定表名并稳定补齐实体 id', () => {
    const input = {
      ...externalState(),
      tableName: 'analytics.users',
      rows: [{ fieldName: 'id', fieldType: 'bigint', nullable: '否' }],
      indexes: [{ name: 'idx_users_id', fields: [{ name: 'id' }] }],
      foreignKeys: [
        {
          name: 'fk_users_team',
          fields: ['team_id'],
          refTable: 'teams',
          refFields: ['id'],
        },
      ],
    };

    const first = decodePersistedState(input);
    const second = decodePersistedState(input);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      schemaName: 'analytics',
      tableName: 'users',
      rows: [{ id: 'legacy-field-0', nullable: false }],
      indexes: [{ id: 'legacy-index-0' }],
      foreignKeys: [{ id: 'legacy-foreign-key-0' }],
    });
  });

  it('兼容模式修复未知数据库类型，外部模式拒绝不完整或未知输入', () => {
    expect(decodePersistedState({ tableName: 'users', dbType: 'unknown' })?.dbType).toBe('mysql');
    expect(decodePersistedState({}, 'external')).toBeNull();
    expect(decodePersistedState({ ...externalState(), dbType: 'unknown' }, 'external')).toBeNull();
  });

  it('只保留结构和取值合法的嵌套配置', () => {
    const decoded = decodePersistedState({
      ...externalState(),
      citusShardingConfig: { mode: 'invalid', distributionColumn: 1 },
      mysqlPartitionConfig: { enabled: true },
      fieldTableViewConfig: { freezeEnabled: true, freezeColumns: '2' },
      foreignKeys: [{ name: 'broken' }],
    });

    expect(decoded?.citusShardingConfig).toBeUndefined();
    expect(decoded?.mysqlPartitionConfig).toBeUndefined();
    expect(decoded?.fieldTableViewConfig).toEqual({ freezeEnabled: true, freezeColumns: 0 });
    expect(decoded?.foreignKeys).toEqual([]);
  });
});

describe('decodeWorkspaceSnapshot', () => {
  it('拒绝只有外壳、内部 state 无效的快照', () => {
    expect(
      decodeWorkspaceSnapshot({
        globalDraft: { state: {}, updatedAt: 1 },
        drafts: [],
        savedTables: [],
        savedDrafts: [],
        folders: [],
      }),
    ).toBeNull();
  });

  it('返回已规范化的合法快照', () => {
    const decoded = decodeWorkspaceSnapshot({
      globalDraft: { state: externalState(), updatedAt: 1 },
      drafts: [],
      savedTables: [],
      savedDrafts: [],
      folders: [],
    });

    expect(decoded?.globalDraft?.state).toMatchObject({
      schemaName: '',
      tableName: 'users',
      sqlFormatMode: 'compact',
    });
  });
});
