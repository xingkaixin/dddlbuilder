import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getShareState } from '@/services/shareService';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { buildDDL } from '@ddlbuilder/ddl-core';
import { normalizeFields } from '@/utils/helpers';

const createState = (): PersistedState => ({
  schemaName: '',
  tableName: 'users',
  tableComment: '用户表',
  dbType: 'mysql',
  sqlFormatMode: 'compact',
  rows: [],
  addCount: 10,
  indexes: [],
  authInput: '',
  authObjects: [],
});

const mockResponse = <T>(body: T, status = 200) => Response.json(body, { status });

describe('shareService', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('getShareState 应归一化服务端 KV 里迁移前写入的字段枚举值', async () => {
    const legacyState = {
      ...createState(),
      rows: [
        {
          id: 'field-id',
          fieldName: 'id',
          fieldType: 'BIGINT',
          fieldComment: '主键',
          nullable: '否',
          defaultKind: '自增',
          defaultValue: '',
          onUpdate: '无',
        },
        {
          id: 'field-created_at',
          fieldName: 'created_at',
          fieldType: 'TIMESTAMP',
          fieldComment: '创建时间',
          nullable: '否',
          defaultKind: '当前时间',
          defaultValue: '',
          onUpdate: '当前时间',
        },
      ],
    };

    vi.mocked(fetch).mockResolvedValue(mockResponse({ id: 's1', state: legacyState }));

    const result = await getShareState('s1');

    expect(result.rows).toEqual([
      { ...legacyState.rows[0], nullable: false, defaultKind: 'auto_increment', onUpdate: 'none' },
      {
        ...legacyState.rows[1],
        nullable: false,
        defaultKind: 'current_timestamp',
        onUpdate: 'current_timestamp',
      },
    ]);

    const ddl = buildDDL({
      dbType: 'mysql',
      tableName: result.tableName,
      tableComment: '',
      fields: normalizeFields(result.rows),
    });
    expect(ddl).toContain('AUTO_INCREMENT');
    expect(ddl).toContain('NOT NULL');
    expect(ddl).toContain('DEFAULT CURRENT_TIMESTAMP');
    expect(ddl).toContain('ON UPDATE CURRENT_TIMESTAMP');
  });
});
