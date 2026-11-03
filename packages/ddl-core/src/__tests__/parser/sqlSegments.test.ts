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
});
