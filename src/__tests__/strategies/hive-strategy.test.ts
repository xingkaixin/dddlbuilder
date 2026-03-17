import { describe, expect, it } from 'vitest';
import { HiveStrategy } from '@/strategies/HiveStrategy';
import type { NormalizedField, TableMiscConfig } from '@/types';

describe('HiveStrategy', () => {
  const strategy = new HiveStrategy();

  it('应返回 hive 数据库类型', () => {
    expect(strategy.getDatabaseType()).toBe('hive');
  });

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

  it('应生成 ORC 存储格式', () => {
    const fields: NormalizedField[] = [
      {
        name: 'id',
        type: 'int',
        comment: '',
        nullable: false,
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
    ];

    const config: TableMiscConfig = {
      enabled: true,
      storedAs: 'ORC',
    };

    const ddl = strategy.generateTableDDL('test_table', '', fields, config);

    expect(ddl).toContain('STORED AS ORC');
  });

  it('应生成 TEXTFILE 存储格式', () => {
    const fields: NormalizedField[] = [
      {
        name: 'id',
        type: 'int',
        comment: '',
        nullable: false,
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
    ];

    const config: TableMiscConfig = {
      enabled: true,
      storedAs: 'TEXTFILE',
    };

    const ddl = strategy.generateTableDDL('test_table', '', fields, config);

    expect(ddl).toContain('STORED AS TEXTFILE');
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

    expect(ddl).toContain("COMMENT '描述''内容'");
  });

  it('应生成表注释', () => {
    const fields: NormalizedField[] = [
      {
        name: 'id',
        type: 'int',
        comment: '',
        nullable: false,
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
    ];

    const ddl = strategy.generateTableDDL('test_table', '测试表', fields);

    expect(ddl).toContain("COMMENT '测试表'");
  });

  it('应生成 EXTERNAL TABLE 和 LOCATION', () => {
    const fields: NormalizedField[] = [
      {
        name: 'id',
        type: 'int',
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
      location: '/user/hive/warehouse/my_table',
    };

    const ddl = strategy.generateTableDDL('test_table', '', fields, config);

    expect(ddl).toContain('CREATE EXTERNAL TABLE test_table (');
    expect(ddl).toContain("LOCATION '/user/hive/warehouse/my_table'");
  });

  it('应同时支持 EXTERNAL + STORED AS + LOCATION', () => {
    const fields: NormalizedField[] = [
      {
        name: 'id',
        type: 'int',
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
      location: '/data/logs',
    };

    const ddl = strategy.generateTableDDL('logs', '日志表', fields, config);

    expect(ddl).toContain('CREATE EXTERNAL TABLE logs (');
    expect(ddl).toContain("COMMENT '日志表'");
    expect(ddl).toContain('STORED AS ORC');
    expect(ddl).toContain("LOCATION '/data/logs'");
  });

  it('应忽略 AUTO_INCREMENT（Hive 不支持）', () => {
    const fields: NormalizedField[] = [
      {
        name: 'id',
        type: 'int',
        comment: '',
        nullable: false,
        defaultKind: 'auto_increment',
        defaultValue: '',
        onUpdate: 'none',
      },
    ];

    const ddl = strategy.generateTableDDL('test_table', '', fields);

    expect(ddl).toContain('  id INT');
    expect(ddl).not.toContain('AUTO_INCREMENT');
  });

  it('应生成类型映射', () => {
    const fields: NormalizedField[] = [
      {
        name: 'f_string',
        type: 'varchar(100)',
        comment: '',
        nullable: true,
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
      {
        name: 'f_bigint',
        type: 'bigint',
        comment: '',
        nullable: true,
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
      {
        name: 'f_bool',
        type: 'boolean',
        comment: '',
        nullable: true,
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
      {
        name: 'f_ts',
        type: 'timestamp',
        comment: '',
        nullable: true,
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
      {
        name: 'f_blob',
        type: 'blob',
        comment: '',
        nullable: true,
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
    ];

    const ddl = strategy.generateTableDDL('test_table', '', fields);

    expect(ddl).toContain('f_string STRING');
    expect(ddl).toContain('f_bigint BIGINT');
    expect(ddl).toContain('f_bool BOOLEAN');
    expect(ddl).toContain('f_ts TIMESTAMP');
    expect(ddl).toContain('f_blob BINARY');
  });

  it('应支持库名.表名格式', () => {
    const fields: NormalizedField[] = [
      {
        name: 'id',
        type: 'int',
        comment: '',
        nullable: false,
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
    ];

    const ddl = strategy.generateTableDDL('mydb.users', '', fields);

    expect(ddl).toContain('CREATE TABLE mydb.users (');
  });

  it('应生成 PARTITIONED BY 单列分区', () => {
    const fields: NormalizedField[] = [
      {
        name: 'id',
        type: 'int',
        comment: '',
        nullable: false,
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
      {
        name: 'value',
        type: 'double',
        comment: '',
        nullable: true,
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
    ];

    const config: TableMiscConfig = {
      enabled: true,
      partitions: {
        enabled: true,
        columns: [
          { name: 'pt', type: 'string', comment: '日期分区' },
        ],
      },
    };

    const ddl = strategy.generateTableDDL('events', '', fields, config);

    expect(ddl).toContain("PARTITIONED BY (\n  pt STRING COMMENT '日期分区'\n)");
  });

  it('应生成 PARTITIONED BY 多列分区', () => {
    const fields: NormalizedField[] = [
      {
        name: 'id',
        type: 'int',
        comment: '',
        nullable: false,
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
    ];

    const config: TableMiscConfig = {
      enabled: true,
      partitions: {
        enabled: true,
        columns: [
          { name: 'year', type: 'int', comment: '年' },
          { name: 'month', type: 'string', comment: '月' },
        ],
      },
    };

    const ddl = strategy.generateTableDDL('logs', '', fields, config);

    expect(ddl).toContain('PARTITIONED BY (');
    expect(ddl).toContain('  year INT COMMENT \'年\'');
    expect(ddl).toContain('  month STRING COMMENT \'月\'');
  });

  it('应组合 PARTITIONED BY + STORED AS + EXTERNAL', () => {
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
        columns: [
          { name: 'dt', type: 'string', comment: '' },
        ],
      },
    };

    const ddl = strategy.generateTableDDL(
      'events',
      '事件表',
      fields,
      config,
    );

    expect(ddl).toContain('CREATE EXTERNAL TABLE events (');
    expect(ddl).toContain("COMMENT '事件表'");
    expect(ddl).toContain('\nPARTITIONED BY (\n  dt STRING\n)');
    expect(ddl).toContain('STORED AS ORC');
    expect(ddl).toContain("LOCATION '/data/events'");
  });

  it('分区未启用时不应生成 PARTITIONED BY', () => {
    const fields: NormalizedField[] = [
      {
        name: 'id',
        type: 'int',
        comment: '',
        nullable: false,
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
    ];

    const config: TableMiscConfig = {
      enabled: true,
      partitions: {
        enabled: false,
        columns: [{ name: 'pt', type: 'string', comment: '' }],
      },
    };

    const ddl = strategy.generateTableDDL('test_table', '', fields, config);

    expect(ddl).not.toContain('PARTITIONED BY');
  });

  it('索引 DDL 应返回空字符串', () => {
    const result = strategy.generateIndexDDL('test_table', {
      id: '1',
      name: 'idx_name',
      fields: [{ name: 'name', direction: 'ASC' }],
      unique: false,
    });

    expect(result).toBe('');
  });
});
