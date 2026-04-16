import { describe, expect, it } from 'vitest';
import type { NormalizedField } from '@ddlbuilder/shared-types';
import { buildDefaultClause } from '@/utils/alter-ddl/defaultClause';

function createField(overrides: Partial<NormalizedField> = {}): NormalizedField {
  return {
    name: 'col',
    type: 'varchar(64)',
    comment: '',
    nullable: true,
    defaultKind: 'none',
    defaultValue: '',
    onUpdate: 'none',
    ...overrides,
  };
}

describe('buildDefaultClause', () => {
  it('常量默认值应按类型格式化并转义', () => {
    const clause = buildDefaultClause(
      createField({
        defaultKind: 'constant',
        defaultValue: "O'Hara",
      }),
      'mysql',
    );

    expect(clause).toBe(" DEFAULT 'O''Hara'");
  });

  it('uuid 默认值应按数据库类型生成', () => {
    const mysqlClause = buildDefaultClause(
      createField({
        type: 'char(36)',
        defaultKind: 'uuid',
      }),
      'mysql',
    );
    const postgresClause = buildDefaultClause(
      createField({
        type: 'uuid',
        defaultKind: 'uuid',
      }),
      'postgresql',
    );

    expect(mysqlClause).toBe('DEFAULT (UUID())');
    expect(postgresClause).toBe('DEFAULT gen_random_uuid()');
  });

  it('当前时间默认值应按数据库类型生成', () => {
    const sqlServerClause = buildDefaultClause(
      createField({
        type: 'datetime2',
        defaultKind: 'current_timestamp',
      }),
      'sqlserver',
    );
    const mysqlClause = buildDefaultClause(
      createField({
        type: 'timestamp',
        defaultKind: 'current_timestamp',
      }),
      'mysql',
    );
    const unsupportedClause = buildDefaultClause(
      createField({
        type: 'int',
        defaultKind: 'current_timestamp',
      }),
      'mysql',
    );

    expect(sqlServerClause).toBe('DEFAULT GETDATE()');
    expect(mysqlClause).toBe('DEFAULT CURRENT_TIMESTAMP');
    expect(unsupportedClause).toBe('');
  });

  it('不支持的 uuid 类型应返回空字符串', () => {
    const clause = buildDefaultClause(
      createField({
        type: 'json',
        defaultKind: 'uuid',
      }),
      'mysql',
    );

    expect(clause).toBe('');
  });
});
