import { describe, expect, it } from 'vitest';
import { extractPartitionConfig } from '../../parser/partitionParser.js';

describe('partitionParser', () => {
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
        { id: expect.any(String), name: 'p2024', value: "'2025-01-01'" },
        { id: expect.any(String), name: 'pmax', value: 'MAXVALUE' },
      ],
      expression: undefined,
    });
  });
});
