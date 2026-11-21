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

  it('falls back to string generation for Object.prototype property type names', () => {
    const fields = [
      createField({ name: 'col_a', type: 'constructor', defaultKind: 'none' }),
      createField({ name: 'col_b', type: 'toString', defaultKind: 'none' }),
    ];
    const result = generateMockData('items', '', fields, 'mysql', { rowCount: 1 });

    expect(JSON.parse(result.json)).toEqual([
      {
        col_a: expect.any(String),
        col_b: expect.any(String),
      },
    ]);
    expect(result.insertSql).not.toContain('NaN');
  });

  it('produces identical output for the same inputs and seed', () => {
    const fields = [
      createField({ name: 'id', type: 'bigint', defaultKind: 'auto_increment' }),
      createField({ name: 'name', type: 'varchar(50)', defaultKind: 'none' }),
      createField({ name: 'email', type: 'varchar(100)', defaultKind: 'none', nullable: true }),
      createField({ name: 'request_id', type: 'char(36)', defaultKind: 'uuid' }),
      createField({ name: 'price', type: 'decimal(10,2)', defaultKind: 'none' }),
      createField({ name: 'score', type: 'double', defaultKind: 'none' }),
      createField({ name: 'created_at', type: 'datetime', defaultKind: 'none' }),
    ];

    const first = generateMockData('orders', 'shop', fields, 'mysql', { rowCount: 5, seed: 42 });
    const second = generateMockData('orders', 'shop', fields, 'mysql', { rowCount: 5, seed: 42 });
    const defaultFirst = generateMockData('orders', 'shop', fields, 'mysql', { rowCount: 5 });

    const explicitZero = generateMockData('orders', 'shop', fields, 'mysql', {
      rowCount: 5,
      seed: 0,
    });

    expect(second).toEqual(first);
    expect(defaultFirst).toEqual(explicitZero);
  });

  it('regenerates different deterministic output when seed changes', () => {
    const fields = [
      createField({ name: 'name', type: 'varchar(50)', defaultKind: 'none' }),
      createField({ name: 'phone', type: 'varchar(20)', defaultKind: 'none' }),
      createField({ name: 'request_id', type: 'char(36)', defaultKind: 'uuid' }),
      createField({ name: 'price', type: 'decimal(10,2)', defaultKind: 'none' }),
    ];

    const seed0 = generateMockData('users', '', fields, 'mysql', { rowCount: 4, seed: 0 });
    const seed1 = generateMockData('users', '', fields, 'mysql', { rowCount: 4, seed: 1 });
    const seed1Again = generateMockData('users', '', fields, 'mysql', { rowCount: 4, seed: 1 });

    expect(seed1.json).not.toEqual(seed0.json);
    expect(seed1.insertSql).not.toEqual(seed0.insertSql);
    expect(seed1.csv).not.toEqual(seed0.csv);
    expect(seed1Again).toEqual(seed1);
  });
});
