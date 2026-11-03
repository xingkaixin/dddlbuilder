import { describe, expect, it } from 'vitest';
import {
  renameSqlExpressionFields,
  sqlExpressionReferencesField,
} from '../utils/sqlExpressionIdentifiers';

describe('SQL expression field references', () => {
  it.each([
    ['YEAR(created_at)', 'year', 'fiscal_year', 'YEAR(created_at)', false],
    [
      "'created_at' + created_at /* created_at */",
      'created_at',
      'created on',
      "'created_at' + `created on` /* created_at */",
      true,
    ],
    ['yearly + other_year + year1', 'year', 'fiscal_year', 'yearly + other_year + year1', false],
    ['year', 'year', 'select', '`select`', true],
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
});
