import { describe, expect, it } from 'vitest';
import { getSqlIdentifierKey } from '../utils/sqlIdentifiers';

describe('getSqlIdentifierKey', () => {
  it.each(['postgresql', 'kingbase', 'gaussdb'] as const)(
    '%s preserves editor identifier case',
    (dbType) => {
      expect(getSqlIdentifierKey(' UserID ', dbType)).toBe('UserID');
      expect(getSqlIdentifierKey('"UserID"', dbType)).toBe('UserID');
      expect(getSqlIdentifierKey('userid', dbType)).toBe('userid');
      expect(getSqlIdentifierKey('"User""ID"', dbType)).toBe('User"ID');
    },
  );

  it.each(['mysql', 'sqlserver'] as const)(
    '%s preserves case-insensitive editor matching',
    (dbType) => {
      expect(getSqlIdentifierKey(' UserID ', dbType)).toBe('userid');
      expect(getSqlIdentifierKey('[UserID]', dbType)).toBe('userid');
      expect(getSqlIdentifierKey('`UserID`', dbType)).toBe('userid');
    },
  );

  it.each(['oracle', 'oceanbase-oracle', 'dm'] as const)(
    '%s folds unquoted names and preserves delimited names',
    (dbType) => {
      expect(getSqlIdentifierKey(' UserID ', dbType)).toBe('USERID');
      expect(getSqlIdentifierKey('userid', dbType)).toBe('USERID');
      expect(getSqlIdentifierKey('"UserID"', dbType)).toBe('UserID');
      expect(getSqlIdentifierKey('"User""ID"', dbType)).toBe('User"ID');
      expect(getSqlIdentifierKey('"USERID"', dbType)).toBe(getSqlIdentifierKey('userid', dbType));
    },
  );
});
