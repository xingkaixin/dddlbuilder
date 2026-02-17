import { describe, expect, it } from 'vitest';
import { preprocessMysql } from '@/utils/sql-parser/preprocessMysql';

describe('preprocessMysql', () => {
  it('未包含分区语法时应直接返回原始结果', () => {
    const sql = 'CREATE TABLE users (id INT);';
    const result = preprocessMysql(sql);

    expect(result).toEqual({
      sql,
      indexes: [],
      tableComment: '',
      columnComments: {},
    });
  });

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
    expect(result.columnComments).toEqual({
      id: '主键',
      name: '姓名',
    });
    expect(result.indexes).toHaveLength(2);
    expect(result.indexes[0]).toContain('CREATE INDEX idx_users_name');
    expect(result.indexes[1]).toContain('ALTER TABLE users ADD INDEX');
  });

  it('含分区但不含 CREATE TABLE 时应保持默认返回', () => {
    const sql = 'ALTER TABLE users PARTITION BY HASH(id);';
    const result = preprocessMysql(sql);

    expect(result.sql).toBe(sql);
    expect(result.indexes).toEqual([]);
    expect(result.tableComment).toBe('');
    expect(result.columnComments).toEqual({});
  });
});
