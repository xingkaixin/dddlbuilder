import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseType, NormalizedField } from '@ddlbuilder/shared-types';
import { generateMockData } from '@/utils/mockDataGenerator';

const field = (
  name: string,
  type: string,
  overrides: Partial<NormalizedField> = {},
): NormalizedField => ({
  name,
  type,
  comment: '',
  nullable: false,
  defaultKind: 'none',
  defaultValue: '',
  onUpdate: 'none',
  ...overrides,
});

const generate = (column: NormalizedField, dbType: DatabaseType = 'mysql') => {
  const result = generateMockData('sample', '', [column], dbType, { rowCount: 3 });

  type GeneratedScalar = string | number | boolean | null;

  const rows: Record<string, GeneratedScalar>[] = JSON.parse(result.json);

  return {
    ...result,
    values: rows.map((row) => row[column.name]),
  };
};

describe('Mock data field constraints', () => {
  beforeEach(() => vi.spyOn(Math, 'random').mockReturnValue(0.5));
  afterEach(() => vi.restoreAllMocks());

  it('does not let semantic hints override the storage type or size', () => {
    const columns = [
      field('gender', 'tinyint'),
      field('name', 'varchar(1)'),
      field('balance', 'decimal(3,2)'),
    ];
    const rows = JSON.parse(generateMockData('sample', '', columns, 'mysql', { rowCount: 1 }).json);
    console.info('Mock field constraint probe', rows[0]);

    expect(Number.isInteger(rows[0].gender)).toBe(true);
    expect(rows[0].gender).toBeGreaterThanOrEqual(0);
    expect(rows[0].gender).toBeLessThanOrEqual(127);
    expect(Array.from(rows[0].name)).toHaveLength(1);
    expect(rows[0].balance).toBeLessThan(10);
  });

  it.each([
    ['decimal(3,2)', 10],
    ['numeric(102,101)', 10],
  ])('generates finite values within %s without overflowing arithmetic', (type, exclusiveLimit) => {
    for (const value of generate(field('price', type)).values) {
      expect(Number.isFinite(value)).toBe(true);
      // SAFETY: The generator contract for numeric fields produces finite numbers, asserted immediately above.
      expect(Math.abs(value as number)).toBeLessThan(exclusiveLimit);
    }
  });

  it('renders PostgreSQL boolean values as boolean SQL literals', () => {
    const output = generate(field('status', 'boolean'), 'postgresql');

    for (const value of output.values) expect(value).toBeTypeOf('boolean');
    expect(output.insertSql).toMatch(/\((?:TRUE|FALSE)\)/);
  });
});
