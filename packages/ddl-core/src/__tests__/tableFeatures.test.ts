import { describe, expect, it } from 'vitest';
import {
  buildCitusShardingDDL,
  buildMysqlPartitionClause,
  buildOracleSynonyms,
} from '../utils/tableFeatures';
import { buildDDL } from '../utils/ddlGenerators';

describe('tableFeatures', () => {
  it('生成 Citus 引用表与分布表语句', () => {
    expect(buildCitusShardingDDL(' users ', { mode: 'reference' })).toBe(
      "SELECT create_reference_table('users');",
    );
    expect(
      buildCitusShardingDDL('users', {
        mode: 'distributed',
        distributionColumn: 'tenant_id',
      }),
    ).toBe("SELECT create_distributed_table('users', 'tenant_id');");
    expect(buildCitusShardingDDL('users', { mode: 'distributed' })).toBe('-- 请选择分片字段');
  });

  it('忽略未启用或缺少分区键的 MySQL 分区配置', () => {
    expect(
      buildMysqlPartitionClause({
        enabled: false,
        type: 'HASH',
        columns: ['id'],
        partitionCount: 4,
        partitions: [],
      }),
    ).toBe('');
    expect(
      buildMysqlPartitionClause({
        enabled: true,
        type: 'HASH',
        columns: [],
        partitionCount: 4,
        partitions: [],
      }),
    ).toBe('');
  });

  it('生成 HASH、KEY 及默认分区数量', () => {
    expect(
      buildMysqlPartitionClause({
        enabled: true,
        type: 'HASH',
        columns: ['id'],
        partitionCount: 8,
        partitions: [],
      }),
    ).toBe('\nPARTITION BY HASH(id)\nPARTITIONS 8');
    expect(
      buildMysqlPartitionClause({
        enabled: true,
        type: 'KEY',
        columns: [],
        expression: 'tenant_id',
        partitions: [],
      }),
    ).toBe('\nPARTITION BY KEY(tenant_id)\nPARTITIONS 4');
  });

  it('限制 HASH 与 KEY 的分区数量', () => {
    expect(
      buildMysqlPartitionClause({
        enabled: true,
        type: 'HASH',
        columns: ['id'],
        partitionCount: -9,
      }),
    ).toBe('\nPARTITION BY HASH(id)\nPARTITIONS 1');
    expect(
      buildMysqlPartitionClause({
        enabled: true,
        type: 'KEY',
        columns: ['id'],
        partitionCount: 1_000_000,
      }),
    ).toBe('\nPARTITION BY KEY(id)\nPARTITIONS 8192');
  });

  it('生成 RANGE 与 LIST 分区定义并提示缺失定义', () => {
    expect(
      buildMysqlPartitionClause({
        enabled: true,
        type: 'RANGE',
        columns: ['created_at'],
        partitions: [],
      }),
    ).toBe('\n-- 请添加分区定义');
    expect(
      buildMysqlPartitionClause({
        enabled: true,
        type: 'RANGE COLUMNS',
        columns: ['created_at'],
        partitions: [{ id: 'partition-max', name: 'pmax', value: 'MAXVALUE' }],
      }),
    ).toContain('PARTITION pmax VALUES LESS THAN (MAXVALUE)');
    expect(
      buildMysqlPartitionClause({
        enabled: true,
        type: 'LIST',
        columns: ['status'],
        partitions: [{ id: 'partition-active', name: 'p_active', value: '1, 2' }],
      }),
    ).toContain('PARTITION p_active VALUES IN (1, 2)');
  });

  it.each(['KEY', 'RANGE COLUMNS', 'LIST COLUMNS'] as const)(
    'quotes column identifiers and partition names in %s',
    (type) => {
      const sql = buildDDL({
        dbType: 'mysql',
        tableName: 'events',
        tableComment: '',
        fields: ['order', 'batch`id'].map((name) => ({
          name,
          type: 'int',
          nullable: false,
          comment: '',
          defaultKind: 'none',
          defaultValue: '',
          onUpdate: 'none',
        })),
        mysqlPartitionConfig: {
          enabled: true,
          type,
          columns: ['order', 'batch`id'],
          partitionCount: 2,
          partitions: [
            { id: '1', name: 'range', value: type === 'LIST COLUMNS' ? '(10, 10)' : '10, 10' },
            { id: '2', name: 'batch`name', value: type === 'LIST COLUMNS' ? '(20, 20)' : '20, 20' },
          ],
        },
      });
      expect(sql).toContain(`PARTITION BY ${type}(\`order\`, \`batch\`\`id\`)`);
      expect(sql.includes('PARTITION `range` VALUES')).toBe(type !== 'KEY');
      expect(sql.includes('PARTITION `batch``name` VALUES')).toBe(type !== 'KEY');
    },
  );

  it('preserves partition expressions as SQL', () => {
    expect(
      buildMysqlPartitionClause({
        enabled: true,
        type: 'HASH',
        columns: ['created_at'],
        expression: 'YEAR(created_at)',
        partitionCount: 8,
      }),
    ).toBe('\nPARTITION BY HASH(YEAR(created_at))\nPARTITIONS 8');
  });

  it('忽略未知分区类型', () => {
    expect(
      buildMysqlPartitionClause({
        enabled: true,
        type: 'UNKNOWN' as never,
        columns: ['id'],
        partitions: [],
      }),
    ).toBe('');
  });

  it('生成 Oracle 公共同义词', () => {
    expect(buildOracleSynonyms('')).toBe('');
    expect(buildOracleSynonyms(' users ')).toBe(
      'CREATE OR REPLACE PUBLIC SYNONYM users FOR users;',
    );
  });

  it.each(['mysql', 'postgresql'] as const)('装配 %s 表选项时保留字符串内的分号', (dbType) => {
    const ddl = buildDDL({
      dbType,
      tableName: 'users',
      tableComment: 'table;comment',
      fields: [
        {
          name: 'label',
          type: 'varchar(40)',
          nullable: true,
          comment: 'column;comment',
          defaultKind: 'constant',
          defaultValue: "before;after's",
          onUpdate: 'none',
        },
      ],
      tableMiscConfig: { enabled: true, engine: 'InnoDB', tablespace: 'app_data' },
    });
    expect(ddl).toContain("DEFAULT 'before;after''s'");
    expect(ddl).toContain('column;comment');
    expect(ddl).toContain('table;comment');
    expect(ddl).toContain(
      dbType === 'mysql' ? ") COMMENT='table;comment' ENGINE=InnoDB;" : ') TABLESPACE app_data;',
    );
  });
});
