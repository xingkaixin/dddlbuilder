import { describe, expect, it } from 'vitest';
import { HiveStrategy } from '../../strategies/HiveStrategy.js';
import type { NormalizedField, TableMiscConfig } from '@ddlbuilder/shared-types';

describe('HiveStrategy', () => {
  const strategy = new HiveStrategy();

  it('应生成基本建表语句', () => {
    const fields: NormalizedField[] = [
      {
        name: 'id',
        type: 'int',
        comment: '主键',
        nullable: false,
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
      {
        name: 'name',
        type: 'varchar(100)',
        comment: '名称',
        nullable: true,
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
    ];

    const ddl = strategy.generateTableDDL('users', '', fields);

    expect(ddl).toContain('CREATE TABLE users (');
    expect(ddl).toContain("  id INT COMMENT '主键'");
    expect(ddl).toContain("  name STRING COMMENT '名称'");
    expect(ddl).toContain(');');
  });

  it('应生成字段注释', () => {
    const fields: NormalizedField[] = [
      {
        name: 'desc',
        type: 'string',
        comment: "描述'内容",
        nullable: true,
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
    ];

    const ddl = strategy.generateTableDDL('test_table', '', fields);

    expect(ddl).toContain("COMMENT '描述\\'内容'");
  });

  it('应组合 PARTITIONED BY + CLUSTERED BY + STORED AS + EXTERNAL', () => {
    const fields: NormalizedField[] = [
      {
        name: 'id',
        type: 'bigint',
        comment: '',
        nullable: false,
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
    ];

    const config: TableMiscConfig = {
      enabled: true,
      external: true,
      storedAs: 'ORC',
      location: '/data/events',
      partitions: {
        enabled: true,
        columns: [{ name: 'dt', type: 'string', comment: '日期分区' }],
        clustering: {
          enabled: true,
          columns: ['user_id'],
          bucketCount: 8,
        },
      },
    };

    const ddl = strategy.generateTableDDL('events', '事件表', fields, config);

    expect(ddl).toBe(
      'CREATE EXTERNAL TABLE events (\n' +
        '  id BIGINT\n' +
        ") COMMENT '事件表'\n" +
        'PARTITIONED BY (\n' +
        "  dt STRING COMMENT '日期分区'\n" +
        ')\n' +
        'CLUSTERED BY (user_id) INTO 8 BUCKETS\n' +
        'STORED AS ORC\n' +
        "LOCATION '/data/events';",
    );
  });
});
