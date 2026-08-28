import { describe, expect, it } from 'vitest';
import { mapSqlCode, splitSqlStatements } from '../../parser/sqlSegments.js';

describe('SQL lexical boundaries', () => {
  it.each([
    "SELECT 'it''s; safe'; SELECT 2;",
    'SELECT "a;"; SELECT 2;',
    'SELECT `a;`; SELECT 2;',
    'SELECT [a;]]b]; SELECT 2;',
    'SELECT $$a; b$$; SELECT 2;',
    'SELECT $body$a; b$body$; SELECT 2;',
    'SELECT 1 /* outer; /* inner; */ end; */; SELECT 2;',
    'SELECT 1 -- ignored;\n; SELECT 2;',
    "SELECT E'escaped\\'; text'; SELECT 2;",
  ])('does not split protected text in %s', (sql) => {
    expect(splitSqlStatements(sql)).toHaveLength(2);
    expect(splitSqlStatements(sql).join('')).toBe(sql);
  });

  it('preserves quoted values and comments exactly', () => {
    expect(
      mapSqlCode('NUMBER \'NUMBER\' "NUMBER" /* NUMBER */ -- NUMBER\nNUMBER', (sql) =>
        sql.replace(/NUMBER/g, 'DECIMAL'),
      ),
    ).toBe('DECIMAL \'NUMBER\' "NUMBER" /* NUMBER */ -- NUMBER\nDECIMAL');
  });
});
