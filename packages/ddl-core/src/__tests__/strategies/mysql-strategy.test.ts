import { describe, expect, it } from 'vitest';
import { MySqlStrategy } from '../../strategies/MySqlStrategy.js';
import type { NormalizedField } from '@ddlbuilder/shared-types';

describe('MySqlStrategy', () => {
  const strategy = new MySqlStrategy();

  it('应返回 mysql 数据库类型', () => {
    expect(strategy.getDatabaseType()).toBe('mysql');
  });

  it('应生成包含自增、默认值、on update 与注释的 DDL', () => {
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
        name: 'updated_at',
        type: 'timestamp',
        comment: '更新时间',
        nullable: false,
        defaultKind: 'current_timestamp',
        defaultValue: '',
        onUpdate: 'current_timestamp',
      },
      {
        name: 'nickname',
        type: 'varchar(50)',
        comment: "昵称'别名",
        nullable: true,
        defaultKind: 'constant',
        defaultValue: "O'Reilly",
        onUpdate: 'none',
      },
    ];

    const ddl = strategy.generateTableDDL('app.users', "用户'表", fields);

    expect(ddl).toContain('CREATE TABLE app.users');
    expect(ddl).toContain("id INT AUTO_INCREMENT NOT NULL COMMENT '主键'");
    expect(ddl).toContain(
      "updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'",
    );
    expect(ddl).toContain("nickname VARCHAR(50) NULL DEFAULT 'O''Reilly' COMMENT '昵称''别名'");
    expect(ddl).toContain("COMMENT='用户''表'");
  });
});
