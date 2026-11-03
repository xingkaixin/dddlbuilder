import { describe, it, expect } from 'vitest';
import { generateMockData } from '@/utils/mockDataGenerator';
import type { NormalizedField } from '@ddlbuilder/shared-types';

const createField = (overrides: Partial<NormalizedField> = {}): NormalizedField => ({
  name: 'id',
  type: 'bigint',
  comment: '',
  nullable: false,
  defaultKind: 'auto_increment',
  defaultValue: '',
  onUpdate: 'none',
  ...overrides,
});

describe('generateMockData', () => {
  it('generates INSERT SQL for MySQL', () => {
    const fields = [createField({ name: 'id', type: 'bigint', defaultKind: 'auto_increment' })];
    const result = generateMockData('users', '', fields, 'mysql', { rowCount: 2 });
    expect(result.insertSql).toContain('INSERT INTO `users` (`id`)');
    expect(result.insertSql).toContain('VALUES');
    expect(result.insertSql).toContain('(1)');
    expect(result.insertSql).toContain('(2)');
    expect(result.insertSql).toMatch(/;$/);
  });

  it('generates INSERT SQL for SQL Server with bracket quoting', () => {
    const fields = [createField({ name: 'id', type: 'bigint', defaultKind: 'auto_increment' })];
    const result = generateMockData('users', '', fields, 'sqlserver', { rowCount: 1 });
    expect(result.insertSql).toContain('[users]');
    expect(result.insertSql).toContain('[id]');
  });
});
