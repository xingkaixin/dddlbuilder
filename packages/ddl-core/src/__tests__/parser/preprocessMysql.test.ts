import { describe, expect, it } from 'vitest';
import { preprocessMysql } from '../../parser/preprocessMysql.js';

describe('preprocessMysql', () => {
  it('未包含分区语法时应直接返回原始结果', () => {
    const sql = 'CREATE TABLE users (id INT);';
    const result = preprocessMysql(sql);

    expect(result).toEqual({
      sql,
      tableMetadata: [],
      partitionConfigs: {},
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

  it('不应把列默认函数中的右括号误判为建表结束', () => {
    const sql = [
      'CREATE TABLE COO_SC_RAT (',
      "  ID VARCHAR(100) NULL DEFAULT (UUID()) COMMENT '记录编号',",
      "  INFO_SRC VARCHAR(10) NULL DEFAULT '1' COMMENT '信息来源'",
      ") COMMENT='证券公司评级1'",
      'PARTITION BY KEY(ID)',
      'PARTITIONS 4;',
      'CREATE INDEX idx_corp_id ON COO_SC_RAT (INFO_SRC ASC);',
    ].join('\n');

    const result = preprocessMysql(sql);

    expect(result.sql).toContain('DEFAULT (UUID())');
    expect(result.sql).toContain("COMMENT='证券公司评级1'");
    expect(result.sql).not.toContain('PARTITION BY KEY(ID)');
    expect(result.sql).toContain('CREATE INDEX idx_corp_id ON COO_SC_RAT (INFO_SRC ASC);');
    expect(result.partitionConfigs.COO_SC_RAT).toEqual({
      enabled: true,
      type: 'KEY',
      columns: ['ID'],
      partitionCount: 4,
      partitions: [],
      expression: undefined,
    });
  });

  it('含分区但不含 CREATE TABLE 时应保持默认返回', () => {
    const sql = 'ALTER TABLE users PARTITION BY HASH(id);';
    const result = preprocessMysql(sql);

    expect(result.sql).toBe(sql);
    expect(result.tableMetadata).toEqual([]);
    expect(result.partitionConfigs).toEqual({});
  });
});
