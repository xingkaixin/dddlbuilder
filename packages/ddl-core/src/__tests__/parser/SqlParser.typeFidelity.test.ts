import { describe, expect, it } from 'vitest';
import { SqlParser } from '../../parser/SqlParser.js';
import { buildDDL } from '../../utils/ddlGenerators.js';

describe('SQL import fidelity', () => {
  it('保留数字类型的 UNSIGNED 与零精度并可重新生成', async () => {
    const sql = `CREATE TABLE amounts (
      id BIGINT UNSIGNED PRIMARY KEY,
      amount DECIMAL(10,2) UNSIGNED,
      created_at DATETIME(0)
    );`;
    const parser = new SqlParser();
    const result = await parser.parseAsync(sql, 'mysql');

    expect(result.fields.map((field) => field.type)).toEqual([
      'BIGINT UNSIGNED',
      'DECIMAL(10,2) UNSIGNED',
      'DATETIME(0)',
    ]);

    const generated = buildDDL({ ...result, dbType: 'mysql' });
    const reparsed = await parser.parseAsync(generated, 'mysql');
    expect(reparsed.fields).toEqual(result.fields);
  });

  it('ENUM 与 SET 的值在导入和生成后保留大小写、标点、空白和转义', async () => {
    const sql = String.raw`CREATE TABLE choices (
      state ENUM('Open','a,b','Mixed) Case','not null','it''s',' padded ','path\\value'),
      flags SET('First','A,B','default value')
    );`;
    const parser = new SqlParser();
    const result = await parser.parseAsync(sql, 'mysql');

    expect(result.fields.map((field) => field.type)).toEqual([
      String.raw`ENUM('Open', 'a,b', 'Mixed) Case', 'not null', 'it''s', ' padded ', 'path\\value')`,
      "SET('First', 'A,B', 'default value')",
    ]);

    const generated = buildDDL({ ...result, dbType: 'mysql' });
    const reparsed = await parser.parseAsync(generated, 'mysql');
    expect(reparsed.fields).toEqual(result.fields);
  });

  it.each([
    ['GENERATED', 'price INT, total INT GENERATED ALWAYS AS (price * 2) STORED'],
    ['CHECK', 'age INT CHECK (age >= 0)'],
    ['CHECK', 'age INT, CONSTRAINT chk_age CHECK (age >= 0)'],
    ['CHARACTER SET', 'name VARCHAR(20) CHARACTER SET utf8mb4'],
    ['COLLATE', 'name VARCHAR(20) COLLATE utf8mb4_bin'],
    ['ZEROFILL', 'code INT(8) ZEROFILL'],
  ])('批量导入将无法保留的 %s 定义报告为失败', async (feature, definition) => {
    const unsupportedSql = `CREATE TABLE unsupported_table (${definition});`;
    const { results, failed } = await new SqlParser().parseMultiAsync(
      `CREATE TABLE supported_table (id INT); ${unsupportedSql}`,
      'mysql',
    );

    expect(results.map((result) => result.tableName)).toEqual(['supported_table']);
    expect(failed).toEqual([
      { statement: unsupportedSql, error: expect.stringContaining(feature) },
    ]);
  });
});
