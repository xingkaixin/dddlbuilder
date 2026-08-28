import { describe, expect, it } from 'vitest';
import { preprocessOracle } from '../../parser/preprocessors/OraclePreprocessor';
import { preprocessSqlServer } from '../../parser/preprocessors/SqlServerPreprocessor';
import { SqlParser } from '../../parser/SqlParser';

describe('review parser regressions', () => {
  it('preserves Oracle identifiers and quoted literals while adapting types', () => {
    const sql = preprocessOracle(
      "CREATE TABLE t (id NUMBER(10), my_varchar2_backup VARCHAR2(20), status VARCHAR2(10) DEFAULT 'NUMBER'); -- VARCHAR2 NUMBER",
    ).sql;
    expect(sql).toContain('my_varchar2_backup VARCHAR(20)');
    expect(sql).toContain("DEFAULT 'NUMBER'");
    expect(sql).toContain('-- VARCHAR2 NUMBER');
    expect(
      preprocessSqlServer("CREATE TABLE t (x varchar(30) DEFAULT 'gen_random_uuid()')").sql,
    ).toContain("'gen_random_uuid()'");
  });
  it('returns valid tables and the original failed statement with parser diagnostics', async () => {
    const bad = 'CREATE TABLE b (id int, x);';
    const result = await new SqlParser()
      .parseMultiAsync('CREATE TABLE a (id int);\n' + bad, 'mysql')
      .catch((error: Error) => ({
        results: [],
        failed: [{ statement: '', error: error.message }],
      }));
    expect(result.results.map((table) => table.tableName)).toEqual(['a']);
    expect(result.failed[0].statement.trim()).toBe(bad);
    expect(result.failed[0].error).toMatch(/expected|syntax/i);
  });
});
