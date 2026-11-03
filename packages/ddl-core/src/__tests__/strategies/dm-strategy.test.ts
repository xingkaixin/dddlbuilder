import { describe, it, expect } from 'vitest';
import { ProfiledDDLStrategy } from '../../strategies/ProfiledDDLStrategy.js';
import type { NormalizedField } from '@ddlbuilder/shared-types';

describe('DmStrategy', () => {
  const strategy = new ProfiledDDLStrategy('dm');

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
