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
          kind: 'primary',
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
    expect(state.indexes[0].kind).toBe('primary');
  });
});
