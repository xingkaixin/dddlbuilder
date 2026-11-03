import { describe, expect, it } from 'vitest';
import type { EnumValueMeta } from '@ddlbuilder/shared-types';
import { normalizePersistedState } from '@/hooks/workspacePersistence/normalize';

describe('workspacePersistence/normalize', () => {
  it('normalizePersistedState 应保留 enumMeta', () => {
    const enumMeta: EnumValueMeta[] = [
      { value: '0', i18n: { 'zh-CN': '删除' }, color: '#ff0000' },
      { value: '1', i18n: { 'zh-CN': '正常' }, color: '#00ff00' },
    ];
    const result = normalizePersistedState({
      tableName: 't1',
      dbType: 'mysql',
      rows: [
        {
          id: 'field-status',
          order: 1,
          fieldName: 'status',
          fieldType: 'char(1)',
          nullable: '是',
          enumMeta,
        },
        {
          id: 'field-type',
          order: 2,
          fieldName: 'type',
          fieldType: 'int',
          nullable: '是',
          enumMeta: 'not-array',
        },
      ],
      addCount: 10,
      indexes: [],
      authInput: '',
      authObjects: [],
    });

    expect(result).not.toBeNull();
    expect(result?.rows[0].enumMeta).toEqual(enumMeta);
    expect(result?.rows[1].enumMeta).toBeUndefined();
  });

  it('normalizePersistedState 应兼容旧的 schema.tableName 格式', () => {
    const result = normalizePersistedState({
      tableName: 'public.users',
      tableComment: '',
      dbType: 'postgresql',
      rows: [],
      addCount: 10,
      indexes: [],
      authInput: '',
      authObjects: [],
      sqlFormatMode: 'aligned',
    });

    expect(result?.schemaName).toBe('public');
    expect(result?.tableName).toBe('users');
    expect(result?.sqlFormatMode).toBe('aligned');
  });
});
