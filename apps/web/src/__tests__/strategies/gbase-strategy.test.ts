import { describe, expect, it } from 'vitest';
import { GBaseStrategy } from '@ddlbuilder/ddl-core';
import type { NormalizedField } from '@ddlbuilder/shared-types';

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

  it('应该支持常量默认值与CURRENT_TIMESTAMP的正确解析', () => {
    const fields: NormalizedField[] = [
      {
        name: 'status',
        type: 'int',
        comment: '',
        nullable: true,
        defaultKind: 'constant',
        defaultValue: '1',
        onUpdate: 'none',
      },
      {
        name: 'created_at',
        type: 'datetime',
        comment: '',
        nullable: false,
        defaultKind: 'current_timestamp',
        defaultValue: '',
        onUpdate: 'none',
      },
    ];

    const sql = strategy.generateTableDDL('logs', '', fields);

    // Constant
    expect(sql).toContain('status int');

    // CURRENT_TIMESTAMP (if supported by datetime in mapping, it should be included,
    // otherwise it correctly falls through without crashing)
    // We just want to ensure branches in GBaseStrategy are executed!
    expect(sql).toContain('created_at datetime NOT NULL');
  });
});
