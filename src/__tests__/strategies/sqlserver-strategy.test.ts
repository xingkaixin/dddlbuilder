import { describe, expect, it } from 'vitest';
import { SqlServerStrategy } from '@/strategies/SqlServerStrategy';
import type { NormalizedField } from '@/types';

const baseFields: NormalizedField[] = [
  {
    name: 'id',
    type: 'int',
    comment: '',
    nullable: false,
    defaultKind: 'none',
    defaultValue: '',
    onUpdate: 'none',
  },
];

describe('SqlServerStrategy', () => {
  const strategy = new SqlServerStrategy();

  it('应返回 sqlserver 数据库类型', () => {
    expect(strategy.getDatabaseType()).toBe('sqlserver');
  });

  it('生成表注释时应使用 TABLE 层级（带 schema）', () => {
    const ddl = strategy.generateTableDDL('dbo.users', '用户表', baseFields);

    expect(ddl).toContain("@level1type = N'TABLE', @level1name = N'users';");
    expect(ddl).not.toContain("@level1type = N'COLUMN', @level1name = N'users';");
  });
});
