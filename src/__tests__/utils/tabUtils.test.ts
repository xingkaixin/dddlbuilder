import { describe, expect, it } from 'vitest';
import { getAvailableTabs, isTabAvailable } from '@/utils/tabUtils';

describe('tabUtils', () => {
  describe('getAvailableTabs', () => {
    it('should always include base tabs', () => {
      const baseTabs = ['fields', 'indexes', 'auth', 'misc'];
      for (const tab of baseTabs) {
        expect(getAvailableTabs('mysql')).toContain(tab);
        expect(getAvailableTabs('postgresql')).toContain(tab);
      }
    });

    it('should include sharding tab only for postgresql-citus', () => {
      expect(getAvailableTabs('postgresql-citus')).toContain('sharding');
      expect(getAvailableTabs('postgresql')).not.toContain('sharding');
      expect(getAvailableTabs('mysql')).not.toContain('sharding');
    });

    it('should include partition tab for mysql/mariadb/tidb', () => {
      expect(getAvailableTabs('mysql')).toContain('partition');
      expect(getAvailableTabs('mariadb')).toContain('partition');
      expect(getAvailableTabs('tidb')).toContain('partition');
      expect(getAvailableTabs('postgresql')).not.toContain('partition');
      expect(getAvailableTabs('oracle')).not.toContain('partition');
    });
  });

  describe('isTabAvailable', () => {
    it('should return true for always-available tabs', () => {
      expect(isTabAvailable('fields', 'postgresql')).toBe(true);
      expect(isTabAvailable('indexes', 'oracle')).toBe(true);
      expect(isTabAvailable('auth', 'mysql')).toBe(true);
      expect(isTabAvailable('misc', 'sqlserver')).toBe(true);
    });

    it('should return false for partition tab on non-mysql databases', () => {
      expect(isTabAvailable('partition', 'postgresql')).toBe(false);
      expect(isTabAvailable('partition', 'oracle')).toBe(false);
      expect(isTabAvailable('partition', 'sqlserver')).toBe(false);
    });

    it('should return true for partition tab on mysql-family databases', () => {
      expect(isTabAvailable('partition', 'mysql')).toBe(true);
      expect(isTabAvailable('partition', 'mariadb')).toBe(true);
      expect(isTabAvailable('partition', 'tidb')).toBe(true);
    });

    it('should return false for sharding tab on non-citus databases', () => {
      expect(isTabAvailable('sharding', 'postgresql')).toBe(false);
      expect(isTabAvailable('sharding', 'mysql')).toBe(false);
    });

    it('should return true for sharding tab on postgresql-citus', () => {
      expect(isTabAvailable('sharding', 'postgresql-citus')).toBe(true);
    });

    it('should return false for unknown tabs', () => {
      expect(isTabAvailable('nonexistent', 'mysql')).toBe(false);
    });
  });
});
