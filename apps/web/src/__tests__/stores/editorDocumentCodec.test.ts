import { describe, expect, it } from 'vitest';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { toEditorDocumentState, toPersistedState } from '@/stores/editorDocumentCodec';

const createState = (overrides: Partial<PersistedState> = {}): PersistedState => ({
  objectType: 'table',
  schemaName: 'public',
  tableName: 'accounts',
  tableComment: 'Account records',
  dbType: 'postgresql-citus',
  sqlFormatMode: 'aligned',
  viewDefinition: '',
  viewCreateOrReplace: true,
  rows: [
    {
      id: 'field-id',
      fieldName: 'id',
      fieldType: 'bigint',
      fieldComment: 'Primary key',
      nullable: false,
      defaultKind: 'none',
      defaultValue: '',
      onUpdate: 'none',
    },
  ],
  addCount: 10,
  indexInput: 'idx_accounts_id',
  currentIndexFields: [{ name: 'id', direction: 'ASC' }],
  indexes: [
    {
      id: 'index-id',
      name: 'idx_accounts_id',
      fields: [{ name: 'id', direction: 'ASC' }],
      unique: true,
      isPrimary: false,
    },
  ],
  authInput: 'reader',
  authObjects: ['reader'],
  citusShardingConfig: {
    mode: 'distributed',
    distributionColumn: 'id',
  },
  mysqlPartitionConfig: undefined,
  tableMiscConfig: {
    enabled: true,
    fillfactor: 80,
  },
  fieldTableViewConfig: {
    freezeEnabled: true,
    freezeColumns: 4,
  },
  foreignKeys: [
    {
      id: 'foreign-key-id',
      name: 'fk_accounts_tenant',
      fields: ['id'],
      refTable: 'tenants',
      refFields: ['id'],
    },
  ],
  ...overrides,
});

describe('editorDocumentCodec', () => {
  it('完整保留规范化后的编辑器文档', () => {
    const state = createState();

    expect(toPersistedState(toEditorDocumentState(state))).toEqual(state);
  });

  it('只持久化当前数据库支持的配置', () => {
    const state = createState({
      dbType: 'mysql',
      citusShardingConfig: undefined,
      mysqlPartitionConfig: {
        enabled: true,
        type: 'HASH',
        columns: ['id'],
        partitionCount: 8,
      },
    });

    const persistedState = toPersistedState(toEditorDocumentState(state));

    expect(persistedState.citusShardingConfig).toBeUndefined();
    expect(persistedState.mysqlPartitionConfig).toEqual(state.mysqlPartitionConfig);
  });
});
