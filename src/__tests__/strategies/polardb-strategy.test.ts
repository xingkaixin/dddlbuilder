import { describe, expect, it } from 'vitest';
import { PolarDbStrategy } from '@/strategies/PolarDbStrategy';
import type { NormalizedField } from '@ddlbuilder/shared-types';

describe('PolarDbStrategy', () => {
  const strategy = new PolarDbStrategy();

  it('应该返回 polardb 数据库类型', () => {
    expect(strategy.getDatabaseType()).toBe('polardb');
  });

  it('应该生成包含关键语法的 PolarDB DDL', () => {
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
        name: 'created_at',
        type: 'timestamp',
        comment: '',
        nullable: false,
        defaultKind: 'current_timestamp',
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
    ];

    const sql = strategy.generateTableDDL('audit_logs', '审计日志', fields);

    expect(sql).toContain('CREATE TABLE audit_logs');
    expect(sql).toContain("COMMENT='审计日志'");
    expect(sql).toContain("id int NOT NULL COMMENT '主键'");
    expect(sql).toContain('created_at timestamp NOT NULL');
    expect(sql).toContain('trace_id uuid NOT NULL DEFAULT (UUID())');
  });
});
