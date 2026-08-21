import { describe, expect, it } from 'vitest';
import {
  buildCitusShardingDDL,
  buildMysqlPartitionClause,
  buildOracleSynonyms,
  insertTableOptions,
} from '../utils/tableFeatures';

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
        partitions: [{ name: 'pmax', value: 'MAXVALUE' }],
      }),
    ).toContain('PARTITION pmax VALUES LESS THAN (MAXVALUE)');
    expect(
      buildMysqlPartitionClause({
        enabled: true,
        type: 'LIST',
        columns: ['status'],
        partitions: [{ name: 'p_active', value: '1, 2' }],
      }),
    ).toContain('PARTITION p_active VALUES IN (1, 2)');
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

  it('只把表选项插入 CREATE TABLE 主语句', () => {
    expect(insertTableOptions('CREATE TABLE users (id INT);', ' ENGINE=InnoDB')).toBe(
      'CREATE TABLE users (id INT) ENGINE=InnoDB;',
    );
    expect(insertTableOptions('CREATE TABLE users (id INT);', '')).toBe(
      'CREATE TABLE users (id INT);',
    );
    expect(insertTableOptions('SELECT 1;', ' ENGINE=InnoDB')).toBe('SELECT 1;');
    expect(insertTableOptions('CREATE TABLE users (id INT)', ' ENGINE=InnoDB')).toBe(
      'CREATE TABLE users (id INT)',
    );
  });
});
