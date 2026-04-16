import { describe, expect, it } from 'vitest';
import { GaussDbStrategy } from '@ddlbuilder/ddl-core';
import type { NormalizedField } from '@ddlbuilder/shared-types';

describe('GaussDbStrategy', () => {
  const strategy = new GaussDbStrategy();

  it('应该返回 gaussdb 数据库类型', () => {
    expect(strategy.getDatabaseType()).toBe('gaussdb');
  });

  it('应该继承 PostgreSQL 风格 DDL 生成能力', () => {
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
        name: 'name',
        type: 'varchar(100)',
        comment: '名称',
        nullable: false,
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
    ];

    const sql = strategy.generateTableDDL('users', '用户表', fields);

    expect(sql).toContain('CREATE TABLE users');
    expect(sql).toContain('id int NOT NULL');
    expect(sql).toContain('name varchar(100) NOT NULL');
    expect(sql).toContain("COMMENT ON TABLE users IS '用户表';");
    expect(sql).toContain("COMMENT ON COLUMN users.id IS '主键';");
  });
});
