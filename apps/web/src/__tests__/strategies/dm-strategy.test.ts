import { describe, it, expect } from 'vitest';
import { DmStrategy } from '@ddlbuilder/ddl-core';
import type { NormalizedField } from '@ddlbuilder/shared-types';

describe('DmStrategy', () => {
  const strategy = new DmStrategy();

  it('应该返回 dm 数据库类型', () => {
    expect(strategy.getDatabaseType()).toBe('dm');
  });

  it('应该生成基本的达梦数据库 DDL', () => {
    const fields: NormalizedField[] = [
      {
        name: 'id',
        type: 'int',
        comment: '主键ID',
        nullable: false,
        defaultKind: 'auto_increment',
        defaultValue: '',
        onUpdate: 'none',
      },
      {
        name: 'name',
        type: 'varchar(255)',
        comment: '名称',
        nullable: true,
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
      {
        name: 'created_at',
        type: 'timestamp',
        comment: '创建时间',
        nullable: false,
        defaultKind: 'current_timestamp',
        defaultValue: '',
        onUpdate: 'none',
      },
    ];

    const result = strategy.generateTableDDL('users', '用户表', fields);

    // 验证基本结构
    expect(result).toContain('CREATE TABLE users');
    expect(result).toContain('id INT IDENTITY(1,1) NOT NULL');
    expect(result).toContain('name VARCHAR(255)');
    expect(result).toContain('created_at TIMESTAMP NOT NULL DEFAULT SYSDATE');

    // 验证注释语法（Oracle 风格）
    expect(result).toContain("COMMENT ON TABLE users IS '用户表'");
    expect(result).toContain("COMMENT ON COLUMN users.id IS '主键ID'");
  });

  it('应该支持各种整数类型', () => {
    const fields: NormalizedField[] = [
      {
        name: 'tiny',
        type: 'tinyint',
        comment: '',
        nullable: false,
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
      {
        name: 'small',
        type: 'smallint',
        comment: '',
        nullable: false,
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
      {
        name: 'medium',
        type: 'int',
        comment: '',
        nullable: false,
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
      {
        name: 'big',
        type: 'bigint',
        comment: '',
        nullable: false,
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
    ];

    const result = strategy.generateTableDDL('test', '', fields);

    expect(result).toContain('tiny TINYINT(1) NOT NULL');
    expect(result).toContain('small SMALLINT NOT NULL');
    expect(result).toContain('medium INT NOT NULL');
    expect(result).toContain('big BIGINT NOT NULL');
  });

  it('应该支持 DATE 和 TIMESTAMP 类型', () => {
    const fields: NormalizedField[] = [
      {
        name: 'd',
        type: 'date',
        comment: '',
        nullable: true,
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
      {
        name: 'ts',
        type: 'timestamp',
        comment: '',
        nullable: true,
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
    ];

    const result = strategy.generateTableDDL('test', '', fields);

    expect(result).toContain('d DATE NULL');
    expect(result).toContain('ts TIMESTAMP NULL');
  });

  it('应该支持 CLOB 和 BLOB 类型', () => {
    const fields: NormalizedField[] = [
      {
        name: 'c',
        type: 'clob',
        comment: '大文本',
        nullable: true,
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
      {
        name: 'b',
        type: 'blob',
        comment: '二进制',
        nullable: true,
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
    ];

    const result = strategy.generateTableDDL('test', '', fields);

    expect(result).toContain('c CLOB NULL');
    expect(result).toContain('b BLOB NULL');
    expect(result).toContain("COMMENT ON COLUMN test.c IS '大文本'");
    expect(result).toContain("COMMENT ON COLUMN test.b IS '二进制'");
  });

  it('应该支持 NUMBER 类型（达梦特有）', () => {
    const fields: NormalizedField[] = [
      {
        name: 'price',
        type: 'number(10,2)',
        comment: '价格',
        nullable: false,
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
    ];

    const result = strategy.generateTableDDL('products', '', fields);

    expect(result).toContain('price NUMBER(10, 2) NOT NULL');
  });

  it('应该支持布尔类型（使用 NUMBER(1)）', () => {
    const fields: NormalizedField[] = [
      {
        name: 'is_active',
        type: 'boolean',
        comment: '是否激活',
        nullable: false,
        defaultKind: 'constant',
        defaultValue: '1',
        onUpdate: 'none',
      },
    ];

    const result = strategy.generateTableDDL('users', '', fields);

    expect(result).toContain('is_active NUMBER(1) NOT NULL DEFAULT 1');
  });

  it('应该支持 UUID 默认值（使用 SYS_GUID()）', () => {
    const fields: NormalizedField[] = [
      {
        name: 'trace_id',
        type: 'uuid',
        comment: '追踪ID',
        nullable: false,
        defaultKind: 'uuid',
        defaultValue: '',
        onUpdate: 'none',
      },
    ];

    const result = strategy.generateTableDDL('test', '', fields);

    expect(result).toContain('trace_id CHAR(36) NOT NULL DEFAULT SYS_GUID()');
  });

  it('应该支持常量默认值', () => {
    const fields: NormalizedField[] = [
      {
        name: 'status',
        type: 'int',
        comment: '状态',
        nullable: false,
        defaultKind: 'constant',
        defaultValue: '0',
        onUpdate: 'none',
      },
      {
        name: 'name',
        type: 'varchar(100)',
        comment: '名称',
        nullable: false,
        defaultKind: 'constant',
        defaultValue: 'anonymous',
        onUpdate: 'none',
      },
    ];

    const result = strategy.generateTableDDL('test', '', fields);

    expect(result).toContain('status INT NOT NULL DEFAULT 0');
    expect(result).toContain("name VARCHAR(100) NOT NULL DEFAULT 'anonymous'");
  });

  it('不应该支持 ON UPDATE CURRENT_TIMESTAMP', () => {
    const fields: NormalizedField[] = [
      {
        name: 'updated_at',
        type: 'timestamp',
        comment: '更新时间',
        nullable: false,
        defaultKind: 'current_timestamp',
        defaultValue: '',
        onUpdate: 'current_timestamp',
      },
    ];

    const result = strategy.generateTableDDL('test', '', fields);

    // 达梦不支持 ON UPDATE CURRENT_TIMESTAMP
    expect(result).toContain('updated_at TIMESTAMP NOT NULL DEFAULT SYSDATE');
    expect(result).not.toContain('ON UPDATE');
  });
});
