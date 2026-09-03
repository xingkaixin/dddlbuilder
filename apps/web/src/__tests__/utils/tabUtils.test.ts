import { describe, expect, it } from 'vitest';
import { getAvailableTabs, isBuilderTab, isTabAvailable, resolveActiveTab } from '@/utils/tabUtils';

const tableContext = (dbType: Parameters<typeof getAvailableTabs>[0]['dbType']) => ({
  objectType: 'table' as const,
  dbType,
});

describe('tabUtils', () => {
  describe('getAvailableTabs', () => {
    it('should always include base tabs', () => {
      const baseTabs = ['fields', 'indexes', 'auth', 'misc'];
      for (const tab of baseTabs) {
        expect(getAvailableTabs(tableContext('mysql'))).toContain(tab);
        expect(getAvailableTabs(tableContext('postgresql'))).toContain(tab);
      }
    });

    it('should include sharding tab only for postgresql-citus', () => {
      expect(getAvailableTabs(tableContext('postgresql-citus'))).toContain('sharding');
      expect(getAvailableTabs(tableContext('postgresql'))).not.toContain('sharding');
      expect(getAvailableTabs(tableContext('mysql'))).not.toContain('sharding');
    });

    it('should include partition tab for mysql-family databases', () => {
      for (const databaseType of [
        'mysql',
        'mariadb',
        'tidb',
        'oceanbase',
        'gbase',
        'polardb',
      ] as const) {
        expect(getAvailableTabs(tableContext(databaseType))).toContain('partition');
      }
      expect(getAvailableTabs(tableContext('postgresql'))).not.toContain('partition');
      expect(getAvailableTabs(tableContext('oracle'))).not.toContain('partition');
    });

    it('should only expose fields and auth tabs for views', () => {
      expect(getAvailableTabs({ objectType: 'view', dbType: 'postgresql-citus' })).toEqual([
        'fields',
        'auth',
      ]);
    });
  });

  describe('isTabAvailable', () => {
    it('should return true for always-available tabs', () => {
      expect(isTabAvailable('fields', tableContext('postgresql'))).toBe(true);
      expect(isTabAvailable('indexes', tableContext('oracle'))).toBe(true);
      expect(isTabAvailable('auth', tableContext('mysql'))).toBe(true);
      expect(isTabAvailable('misc', tableContext('sqlserver'))).toBe(true);
    });

    it('should return false for partition tab on non-mysql databases', () => {
      expect(isTabAvailable('partition', tableContext('postgresql'))).toBe(false);
      expect(isTabAvailable('partition', tableContext('oracle'))).toBe(false);
      expect(isTabAvailable('partition', tableContext('sqlserver'))).toBe(false);
    });

    it('should return true for partition tab on mysql-family databases', () => {
      for (const databaseType of [
        'mysql',
        'mariadb',
        'tidb',
        'oceanbase',
        'gbase',
        'polardb',
      ] as const) {
        expect(isTabAvailable('partition', tableContext(databaseType))).toBe(true);
      }
    });

    it('should return false for sharding tab on non-citus databases', () => {
      expect(isTabAvailable('sharding', tableContext('postgresql'))).toBe(false);
      expect(isTabAvailable('sharding', tableContext('mysql'))).toBe(false);
    });

    it('should return true for sharding tab on postgresql-citus', () => {
      expect(isTabAvailable('sharding', tableContext('postgresql-citus'))).toBe(true);
    });

    it('should return false for indexes tab on hive', () => {
      expect(isTabAvailable('indexes', tableContext('hive'))).toBe(false);
      expect(getAvailableTabs(tableContext('hive'))).not.toContain('indexes');
    });

    it('should return true for hive-partition tab on hive', () => {
      expect(isTabAvailable('hive-partition', tableContext('hive'))).toBe(true);
    });

    it('should reject unknown tabs at the input boundary', () => {
      expect(isBuilderTab('nonexistent')).toBe(false);
    });
  });

  describe('resolveActiveTab', () => {
    it('keeps an available tab and falls back to fields for invalid document contexts', () => {
      expect(resolveActiveTab('auth', { objectType: 'view', dbType: 'hive' })).toBe('auth');
      expect(resolveActiveTab('indexes', { objectType: 'view', dbType: 'mysql' })).toBe('fields');
      expect(resolveActiveTab('sharding', tableContext('postgresql'))).toBe('fields');
    });
  });
});
