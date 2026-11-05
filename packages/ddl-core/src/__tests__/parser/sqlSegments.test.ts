import { describe, expect, it } from 'vitest';
import { splitSqlStatements } from '../../parser/sqlSegments.js';

describe('SQL lexical boundaries', () => {
  it.each([
    "SELECT 'it''s; safe'; SELECT 2;",
    'SELECT $body$a; b$body$; SELECT 2;',
    'SELECT 1 /* outer; /* inner; */ end; */; SELECT 2;',
  ])('does not split protected text in %s', (sql) => {
    expect(splitSqlStatements(sql)).toHaveLength(2);
    expect(splitSqlStatements(sql).join('')).toBe(sql);
  });

  it('only treats a standalone E prefix as an escape string', () => {
    const sql = "SELECT 1 WHERE p LIKE'C:\\'; SELECT 2;";

    expect(splitSqlStatements(sql, { backslashEscapes: false })).toHaveLength(2);
    expect(
      splitSqlStatements("SELECT E'it\\'s; safe'; SELECT 2;", { backslashEscapes: false }),
    ).toHaveLength(2);
  });
});
