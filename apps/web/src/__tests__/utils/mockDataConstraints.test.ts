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
  const rows = JSON.parse(result.json) as Record<string, unknown>[];
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
    ['x', 'char(1)', 1],
    ['name', 'varchar(2)', 2],
    ['email', 'nvarchar(3)', 3],
    ['address', 'varchar2(4)', 4],
    ['x', 'char', 1],
  ])('bounds %s values by %s', (name, type, length) => {
    for (const value of generate(field(name, type)).values) {
      expect(typeof value).toBe('string');
      expect(Array.from(value as string).length).toBeLessThanOrEqual(length);
    }
  });

  it.each(['tinyint', 'smallint', 'int', 'bigint'])(
    'keeps numeric %s columns numeric despite text hints',
    (type) => {
      for (const value of generate(field('code', type)).values)
        expect(Number.isSafeInteger(value)).toBe(true);
    },
  );

  it.each([
    ['decimal(3,2)', 10],
    ['decimal(2,2)', 1],
    ['numeric(1,0)', 10],
    ['number(3,2)', 10],
    ['decimal(30,20)', 1e10],
    ['numeric(102,101)', 10],
  ])('generates finite values within %s without overflowing arithmetic', (type, exclusiveLimit) => {
    for (const value of generate(field('price', type)).values) {
      expect(Number.isFinite(value)).toBe(true);
      expect(Math.abs(value as number)).toBeLessThan(exclusiveLimit);
    }
  });

  it('honors the decimal scale, including zero and omitted scale', () => {
    for (const type of ['decimal(3)', 'decimal(3,0)', 'number(5,0)']) {
      for (const value of generate(field('price', type)).values)
        expect(Number.isInteger(value)).toBe(true);
    }
    vi.mocked(Math.random).mockReturnValue(0.123456789);
    for (const value of generate(field('price', 'decimal(4,2)')).values) {
      expect(String(value).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(2);
    }
  });

  it.each([0, 1 - Number.EPSILON])('keeps boundary samples in range at random=%s', (sample) => {
    vi.mocked(Math.random).mockReturnValue(sample);
    for (const [type, max] of [
      ['tinyint', 127],
      ['tinyint unsigned', 255],
      ['bit(64)', Number.MAX_SAFE_INTEGER],
      ['decimal(1,0)', 9],
      ['decimal(2,2)', 0.99],
      ['decimal(3,2)', 9.99],
    ] as const) {
      for (const value of generate(field('price', type)).values) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(max);
      }
    }
  });

  it('selects native enum members before considering field name semantics', () => {
    for (const value of generate(field('status', "enum('active','inactive')")).values) {
      expect(['active', 'inactive']).toContain(value);
    }
  });

  it('keeps logical numeric enum values within their field type', () => {
    const column = field('gender', 'tinyint', {
      enumMeta: [
        { value: '0', label: 'A' },
        { value: '1', label: 'B' },
      ],
    });
    for (const value of generate(column).values) expect([0, 1]).toContain(value);
  });

  it('enforces string limits on generated defaults as well as semantic values', () => {
    for (const value of generate(field('id', 'varchar(8)', { defaultKind: 'uuid' })).values) {
      expect(Array.from(value as string)).toHaveLength(8);
    }
  });

  it('uses date and structured types instead of conflicting name hints', () => {
    expect(generate(field('year', 'date')).values[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(() => JSON.parse(generate(field('content', 'json')).values[0] as string)).not.toThrow();
    expect(generate(field('username', 'uuid')).values[0]).toMatch(/^[\da-f-]{36}$/);
  });

  it('renders PostgreSQL boolean values as boolean SQL literals', () => {
    const output = generate(field('status', 'boolean'), 'postgresql');
    expect(output.values.every((value: unknown) => typeof value === 'boolean')).toBe(true);
    expect(output.insertSql).toMatch(/\((?:TRUE|FALSE)\)/);
  });
});
