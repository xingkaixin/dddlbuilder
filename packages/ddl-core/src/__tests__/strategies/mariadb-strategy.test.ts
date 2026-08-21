import { describe, it, expect } from 'vitest';
import { MariaDbStrategy } from '../../strategies/MariaDbStrategy.js';
import type { NormalizedField } from '@ddlbuilder/shared-types';

describe('MariaDbStrategy', () => {
  const strategy = new MariaDbStrategy();

  it('应该返回 mariadb 数据库类型', () => {
    expect(strategy.getDatabaseType()).toBe('mariadb');
  });

  it('应该生成基本的 MariaDB DDL', () => {
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
});
