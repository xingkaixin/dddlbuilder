import { describe, expect, it } from 'vitest';
import {
  PARTITION_BY_REGEX,
  extractPartitionConfig,
} from '@/utils/sql-parser/partitionParser';

describe('partitionParser', () => {
  it('应识别 HASH 分区与分区数量', () => {
    const sql = `
      CREATE TABLE users (id BIGINT)
      PARTITION BY HASH(id) PARTITIONS 8;
    `;

    expect(extractPartitionConfig(sql)).toEqual({
      enabled: true,
      type: 'HASH',
      columns: ['id'],
      partitionCount: 8,
      partitions: [],
      expression: undefined,
    });
  });

  it('HASH/KEY 分区数应至少为 1', () => {
    const sql = `CREATE TABLE t (id BIGINT) PARTITION BY KEY(id) PARTITIONS 0;`;

    expect(extractPartitionConfig(sql)).toEqual({
      enabled: true,
      type: 'KEY',
      columns: ['id'],
      partitionCount: 1,
      partitions: [],
      expression: undefined,
    });
  });

  it('应识别表达式分区键', () => {
    const sql = `
      CREATE TABLE t (created_at DATETIME)
      PARTITION BY HASH(YEAR(created_at)) PARTITIONS 2;
    `;

    expect(extractPartitionConfig(sql)).toEqual({
      enabled: true,
      type: 'HASH',
      columns: [],
      partitionCount: 2,
      partitions: [],
      expression: 'YEAR(created_at)',
    });
  });

  it('应解析 RANGE 分区定义', () => {
    const sql = `
      CREATE TABLE orders (created_at DATE)
      PARTITION BY RANGE (created_at) (
        PARTITION p2024 VALUES LESS THAN ('2025-01-01'),
        PARTITION pmax VALUES LESS THAN (MAXVALUE)
      );
    `;

    expect(extractPartitionConfig(sql)).toEqual({
      enabled: true,
      type: 'RANGE',
      columns: ['created_at'],
      partitionCount: 4,
      partitions: [
        { name: 'p2024', value: "'2025-01-01'" },
        { name: 'pmax', value: 'MAXVALUE' },
      ],
      expression: undefined,
    });
  });

  it('应解析 LIST 分区定义', () => {
    const sql = `
      CREATE TABLE t (region_id INT)
      PARTITION BY LIST (region_id) (
        PARTITION p_cn VALUES IN (1,2),
        PARTITION p_us VALUES IN (3,4)
      );
    `;

    expect(extractPartitionConfig(sql)).toEqual({
      enabled: true,
      type: 'LIST',
      columns: ['region_id'],
      partitionCount: 4,
      partitions: [
        { name: 'p_cn', value: '1,2' },
        { name: 'p_us', value: '3,4' },
      ],
      expression: undefined,
    });
  });

  it('应支持 RANGE COLUMNS 并解析带引号标识符', () => {
    const sql = `
      CREATE TABLE t (created_at DATETIME, tenant_id BIGINT)
      PARTITION BY RANGE COLUMNS(\`created_at\`, \`tenant_id\`);
    `;

    expect(extractPartitionConfig(sql)).toEqual({
      enabled: true,
      type: 'RANGE COLUMNS',
      columns: ['created_at', 'tenant_id'],
      partitionCount: 4,
      partitions: [],
      expression: undefined,
    });
  });

  it('分区定义段缺失或不完整时应返回基础配置', () => {
    const sql = `
      CREATE TABLE t (id INT)
      PARTITION BY LIST COLUMNS(id) (
    `;

    expect(extractPartitionConfig(sql)).toEqual({
      enabled: true,
      type: 'LIST COLUMNS',
      columns: ['id'],
      partitionCount: 4,
      partitions: [],
      expression: undefined,
    });
  });

  it('括号不平衡时应返回 undefined', () => {
    const sql = `CREATE TABLE t (id INT) PARTITION BY HASH(id PARTITIONS 4;`;
    expect(extractPartitionConfig(sql)).toBeUndefined();
  });

  it('非分区 SQL 不应识别配置', () => {
    expect(PARTITION_BY_REGEX.test('ALTER TABLE t ADD COLUMN x INT')).toBe(
      false,
    );
    expect(extractPartitionConfig('CREATE TABLE t (id INT);')).toBeUndefined();
  });
});
