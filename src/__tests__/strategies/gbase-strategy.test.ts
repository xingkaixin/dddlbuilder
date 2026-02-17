import { describe, expect, it } from 'vitest';
import { GBaseStrategy } from '@/strategies/GBaseStrategy';
import type { NormalizedField } from '@/types';

describe('GBaseStrategy', () => {
  const strategy = new GBaseStrategy();

  it('应该返回 gbase 数据库类型', () => {
    expect(strategy.getDatabaseType()).toBe('gbase');
  });

  it('应该生成包含关键语法的 GBase DDL', () => {
    const fields: NormalizedField[] = [
      {
        name: 'id',
        type: 'int',
        comment: '主键',
        nullable: false,
        defaultKind: 'auto_increment',
        defaultValue: '',
        onUpdate: 'none',
      },
      {
        name: 'trace_id',
        type: 'uuid',
        comment: '',
        nullable: false,
        defaultKind: 'uuid',
        defaultValue: '',
        onUpdate: 'none',
      },
      {
        name: 'updated_at',
        type: 'timestamp',
        comment: '',
        nullable: false,
        defaultKind: 'current_timestamp',
        defaultValue: '',
        onUpdate: 'current_timestamp',
      },
    ];

    const sql = strategy.generateTableDDL('orders', '订单表', fields);

    expect(sql).toContain('CREATE TABLE orders');
    expect(sql).toContain("COMMENT='订单表'");
    expect(sql).toContain("id int NOT NULL COMMENT '主键'");
    expect(sql).toContain('trace_id uuid NOT NULL DEFAULT (UUID())');
    expect(sql).toContain('updated_at timestamp NOT NULL');
  });

  it('应该转义注释中的单引号', () => {
    const fields: NormalizedField[] = [
      {
        name: 'name',
        type: 'varchar(50)',
        comment: "O'Hara",
        nullable: true,
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
    ];

    const sql = strategy.generateTableDDL('users', "用户'表", fields);
    expect(sql).toContain("COMMENT='用户''表'");
    expect(sql).toContain("COMMENT 'O''Hara'");
  });
});
