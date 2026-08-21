import { describe, it, expect } from 'vitest';
import { OceanBaseMySqlStrategy } from '../../strategies/OceanBaseMySqlStrategy.js';
import type { NormalizedField } from '@ddlbuilder/shared-types';

describe('OceanBaseMySqlStrategy', () => {
  const strategy = new OceanBaseMySqlStrategy();

  it('应该返回 oceanbase 数据库类型', () => {
    expect(strategy.getDatabaseType()).toBe('oceanbase');
  });

  it('应该生成基本的 OceanBase MySQL 模式 DDL', () => {
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

    expect(result).toContain('CREATE TABLE users');
    expect(result).toContain("COMMENT='用户表'");
    expect(result).toContain('id INT AUTO_INCREMENT NOT NULL');
    expect(result).toContain("name VARCHAR(255) NULL COMMENT '名称'");
    expect(result).toContain('created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP');
  });

  it('应该支持 ON UPDATE CURRENT_TIMESTAMP', () => {
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

    expect(result).toContain(
      'updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
    );
  });

  it('应该支持 UUID 默认值', () => {
    const fields: NormalizedField[] = [
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

    const result = strategy.generateTableDDL('test', '', fields);

    expect(result).toContain('trace_id CHAR(36) NOT NULL DEFAULT (UUID())');
  });

  it('应该支持整数类型', () => {
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

  it('应该支持字符串类型', () => {
    const fields: NormalizedField[] = [
      {
        name: 'vc',
        type: 'varchar(100)',
        comment: '',
        nullable: true,
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
      {
        name: 'c',
        type: 'char(10)',
        comment: '',
        nullable: true,
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
      {
        name: 't',
        type: 'text',
        comment: '',
        nullable: true,
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
    ];

    const result = strategy.generateTableDDL('test', '', fields);

    expect(result).toContain('vc VARCHAR(100) NULL');
    expect(result).toContain('c CHAR(10) NULL');
    expect(result).toContain('t TEXT NULL');
  });

  it('应该支持时间类型', () => {
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
        name: 'dt',
        type: 'datetime',
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
      {
        name: 'tm',
        type: 'time',
        comment: '',
        nullable: true,
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
    ];

    const result = strategy.generateTableDDL('test', '', fields);

    expect(result).toContain('d DATE NULL');
    expect(result).toContain('dt DATETIME NULL');
    expect(result).toContain('ts TIMESTAMP NULL');
    expect(result).toContain('tm TIME NULL');
  });

  it('应该支持 JSON 类型', () => {
    const fields: NormalizedField[] = [
      {
        name: 'metadata',
        type: 'json',
        comment: '元数据',
        nullable: true,
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
    ];

    const result = strategy.generateTableDDL('test', '', fields);

    expect(result).toContain("metadata JSON NULL COMMENT '元数据'");
  });

  it('应该支持表注释和字段注释', () => {
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
        name: 'status',
        type: 'tinyint',
        comment: '状态',
        nullable: false,
        defaultKind: 'constant',
        defaultValue: '0',
        onUpdate: 'none',
      },
    ];

    const result = strategy.generateTableDDL('orders', '订单表', fields);

    expect(result).toContain("COMMENT='订单表'");
    expect(result).toContain("id INT AUTO_INCREMENT NOT NULL COMMENT '主键'");
    expect(result).toContain("status TINYINT(1) NOT NULL DEFAULT 0 COMMENT '状态'");
  });
});
