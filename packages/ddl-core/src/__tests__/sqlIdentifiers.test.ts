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

  it.each(['mysql', 'sqlserver', 'oracle'] as const)(
    '%s preserves case-insensitive editor matching',
    (dbType) => {
      expect(getSqlIdentifierKey(' UserID ', dbType)).toBe('userid');
      expect(getSqlIdentifierKey('[UserID]', dbType)).toBe('userid');
      expect(getSqlIdentifierKey('`UserID`', dbType)).toBe('userid');
    },
  );
});
