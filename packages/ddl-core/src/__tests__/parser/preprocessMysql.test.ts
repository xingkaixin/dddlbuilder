import { describe, expect, it } from 'vitest';
import { preprocessMysql } from '../../parser/preprocessMysql.js';

describe('preprocessMysql', () => {
  it('应移除分区语句并提取列注释与索引语句', () => {
    const sql = [
      'CREATE TABLE users',
      '(',
      "  id INT NOT NULL COMMENT '主键',",
      "  name VARCHAR(20) COMMENT '姓名'",
      ')',
      'PARTITION BY HASH(id) PARTITIONS 4',
      'CREATE INDEX idx_users_name ON users(name);',
      'ALTER TABLE users ADD INDEX idx_users_id (id);',
    ].join('\n');

    const result = preprocessMysql(sql);

    expect(result.sql).not.toContain('PARTITION BY');
    expect(result.sql.endsWith(';')).toBe(true);
    expect(result.tableMetadata[0].columnComments).toEqual({
      id: '主键',
      name: '姓名',
    });
    expect(result.partitionConfigs.users).toEqual({
      enabled: true,
      type: 'HASH',
      columns: ['id'],
      partitionCount: 4,
      partitions: [],
      expression: undefined,
    });
  });
});
