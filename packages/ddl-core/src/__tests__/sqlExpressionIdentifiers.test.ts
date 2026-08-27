import { describe, expect, it } from 'vitest';
import {
  renameSqlExpressionFields,
  sqlExpressionReferencesField,
} from '../utils/sqlExpressionIdentifiers';

describe('SQL expression field references', () => {
  it.each([
    ['YEAR(created_at)', 'year', 'fiscal_year', 'YEAR(created_at)', false],
    ['YEAR /* year */ (created_at)', 'year', 'fiscal_year', 'YEAR /* year */ (created_at)', false],
    [
      'EXTRACT(YEAR FROM created_at)',
      'year',
      'fiscal_year',
      'EXTRACT(YEAR FROM created_at)',
      false,
    ],
    [
      'EXTRACT(YEAR FROM created_at)',
      'created_at',
      'created_on',
      'EXTRACT(YEAR FROM created_on)',
      true,
    ],
    ['year.year + YEAR(year)', 'year', 'fiscal_year', 'year.fiscal_year + YEAR(fiscal_year)', true],
    [
      "'created_at' + created_at /* created_at */",
      'created_at',
      'created on',
      "'created_at' + `created on` /* created_at */",
      true,
    ],
    ['"created_at"', 'created_at', 'created_on', '"created_at"', false],
    [
      "'it\\'s year' + 'year''s value'",
      'year',
      'fiscal_year',
      "'it\\'s year' + 'year''s value'",
      false,
    ],
    ['`a``b`', 'a`b', 'c`d', '`c``d`', true],
    [
      'YEAR(created_at) -- created_at\n+ 1 # created_at',
      'created_at',
      'date',
      'YEAR(date) -- created_at\n+ 1 # created_at',
      true,
    ],
    ['1--year', 'year', 'fiscal_year', '1--fiscal_year', true],
    ['yearly + other_year + year1', 'year', 'fiscal_year', 'yearly + other_year + year1', false],
    ['year', 'year', 'select', '`select`', true],
    ["'unfinished year", 'year', 'fiscal_year', "'unfinished year", false],
  ] as const)(
    'rewrites only column references in %s',
    (source, oldName, newName, expected, referenced) => {
      expect(sqlExpressionReferencesField(source, oldName, 'mysql')).toBe(referenced);
      expect(renameSqlExpressionFields(source, new Map([[oldName, newName]]), 'mysql')).toBe(
        expected,
      );
    },
  );

  it('applies simultaneous renames once', () => {
    expect(
      renameSqlExpressionFields(
        'a + b + other_a',
        new Map([
          ['a', 'b'],
          ['b', 'a'],
        ]),
        'mysql',
      ),
    ).toBe('b + a + other_a');
  });

  it('preserves PostgreSQL quoted identities and dollar-quoted literals', () => {
    const source = '"UserID" + userid + UserID + $$UserID$$ + $tag$UserID$tag$';
    expect(
      renameSqlExpressionFields(source, new Map([['UserID', 'account_id']]), 'postgresql'),
    ).toBe('"account_id" + userid + UserID + $$UserID$$ + $tag$UserID$tag$');
    expect(sqlExpressionReferencesField('userid', 'UserID', 'postgresql')).toBe(false);
    expect(sqlExpressionReferencesField('UserID', 'userid', 'postgresql')).toBe(true);
    expect(sqlExpressionReferencesField('"UserID"', 'UserID', 'postgresql')).toBe(true);
  });

  it('preserves SQL Server identifier escaping', () => {
    expect(renameSqlExpressionFields('[a]]b]', new Map([['a]b', 'c]d']]), 'sqlserver')).toBe(
      '[c]]d]',
    );
  });
});
