import { describe, expect, it } from 'vitest';
import { getAvailableTabs, isTabAvailable } from '@/utils/tabUtils';

const tableContext = (dbType: Parameters<typeof getAvailableTabs>[0]['dbType']) => ({
  objectType: 'table' as const,
  dbType,
});

describe('tabUtils', () => {
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

  it('should return false for indexes tab on hive', () => {
    expect(isTabAvailable('indexes', tableContext('hive'))).toBe(false);
    expect(getAvailableTabs(tableContext('hive'))).not.toContain('indexes');
  });
});
