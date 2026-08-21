import { describe, expect, it } from 'vitest';
import { convertParsedResultToPersistedState } from '@/utils/convertParsedResultToPersistedState';
import type { ParsedResult } from '@ddlbuilder/ddl-core/parser';

describe('convertParsedResultToPersistedState', () => {
  function createParsedResult(overrides: Partial<ParsedResult> = {}): ParsedResult {
    return {
      tableName: 'users',
      tableComment: '用户表',
      fields: [
        {
          name: 'id',
          type: 'INT',
          comment: '主键',
          nullable: false,
          defaultKind: 'auto_increment',
          defaultValue: '',
          onUpdate: 'none',
        },
        {
          name: 'name',
          type: 'VARCHAR(50)',
          comment: '姓名',
          nullable: true,
          defaultKind: 'none',
          defaultValue: '',
          onUpdate: 'none',
        },
      ],
      indexes: [
        {
          id: 'idx-1',
          name: 'PRIMARY',
          fields: [{ name: 'id', direction: 'ASC' }],
          unique: true,
          isPrimary: true,
        },
      ],
      foreignKeys: [
        {
          id: 'fk-1',
          name: 'fk_user_id',
          fields: ['user_id'],
          refTable: 'users',
          refFields: ['id'],
        },
      ],
      authObjects: ['app_user'],
      ...overrides,
    };
  }

  it('字段映射正确', () => {
    const result = createParsedResult();
    const state = convertParsedResultToPersistedState(result, 'mysql');

    expect(state.rows).toHaveLength(12); // 填充到最少 12 行
    expect(state.rows[0]).toEqual({
      id: expect.any(String),
      fieldName: 'id',
      fieldType: 'INT',
      fieldComment: '主键',
      nullable: false,
      defaultKind: 'auto_increment',
      defaultValue: '',
      onUpdate: 'none',
    });
    expect(state.rows[1]).toEqual({
      id: expect.any(String),
      fieldName: 'name',
      fieldType: 'VARCHAR(50)',
      fieldComment: '姓名',
      nullable: true,
      defaultKind: 'none',
      defaultValue: '',
      onUpdate: 'none',
    });
  });

  it('索引保留', () => {
    const result = createParsedResult();
    const state = convertParsedResultToPersistedState(result, 'mysql');

    expect(state.indexes).toHaveLength(1);
    expect(state.indexes[0].name).toBe('PRIMARY');
    expect(state.indexes[0].isPrimary).toBe(true);
  });

  it('外键保留', () => {
    const result = createParsedResult();
    const state = convertParsedResultToPersistedState(result, 'mysql');

    expect(state.foreignKeys).toHaveLength(1);
    expect(state.foreignKeys?.[0].name).toBe('fk_user_id');
  });

  it('授权对象保留', () => {
    const result = createParsedResult();
    const state = convertParsedResultToPersistedState(result, 'mysql');

    expect(state.authObjects).toEqual(['app_user']);
  });

  it('表级配置保留', () => {
    const result = createParsedResult({
      tableMiscConfig: {
        enabled: true,
        engine: 'InnoDB',
        charset: 'utf8mb4',
        collation: 'utf8mb4_bin',
        tablespace: '',
      },
    });
    const state = convertParsedResultToPersistedState(result, 'mysql');

    expect(state.tableMiscConfig).toMatchObject({
      enabled: true,
      engine: 'InnoDB',
      charset: 'utf8mb4',
    });
  });

  it('MySQL 分区配置保留', () => {
    const result = createParsedResult({
      mysqlPartitionConfig: {
        enabled: true,
        type: 'HASH',
        columns: ['id'],
        partitionCount: 8,
        partitions: [],
      },
    });
    const state = convertParsedResultToPersistedState(result, 'mysql');

    expect(state.mysqlPartitionConfig).toMatchObject({
      enabled: true,
      type: 'HASH',
      columns: ['id'],
      partitionCount: 8,
    });
  });

  it('非 MySQL 分区使用默认值', () => {
    const result = createParsedResult();
    const state = convertParsedResultToPersistedState(result, 'postgresql');

    expect(state.mysqlPartitionConfig).toMatchObject({
      enabled: false,
      type: 'RANGE',
    });
  });

  it('默认值处理', () => {
    const result = createParsedResult({
      fields: [
        {
          name: 'created_at',
          type: 'TIMESTAMP',
          comment: '',
          nullable: true,
          defaultKind: 'current_timestamp',
          defaultValue: '',
          onUpdate: 'current_timestamp',
        },
        {
          name: 'uuid_col',
          type: 'CHAR(36)',
          comment: '',
          nullable: true,
          defaultKind: 'uuid',
          defaultValue: '',
          onUpdate: 'none',
        },
        {
          name: 'status',
          type: 'VARCHAR(20)',
          comment: '',
          nullable: true,
          defaultKind: 'constant',
          defaultValue: 'active',
          onUpdate: 'none',
        },
      ],
    });
    const state = convertParsedResultToPersistedState(result, 'mysql');

    expect(state.rows[0].defaultKind).toBe('current_timestamp');
    expect(state.rows[0].onUpdate).toBe('current_timestamp');
    expect(state.rows[1].defaultKind).toBe('uuid');
    expect(state.rows[2].defaultKind).toBe('constant');
    expect(state.rows[2].defaultValue).toBe('active');
  });

  it('schema.table 格式解析', () => {
    const result = createParsedResult({
      schemaName: 'public',
      tableName: 'users',
    });
    const state = convertParsedResultToPersistedState(result, 'postgresql');

    expect(state.schemaName).toBe('public');
    expect(state.tableName).toBe('users');
  });

  it('tableName 含点号时解析 schema', () => {
    const result = createParsedResult({
      schemaName: undefined,
      tableName: 'dbo.users',
    });
    const state = convertParsedResultToPersistedState(result, 'sqlserver');

    expect(state.schemaName).toBe('dbo');
    expect(state.tableName).toBe('users');
  });
});
