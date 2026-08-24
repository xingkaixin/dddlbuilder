import { describe, it, expect, vi } from 'vitest';
import { generateMockData, downloadFile } from '@/utils/mockDataGenerator';
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
  it('returns prompt when no valid fields', () => {
    const result = generateMockData('users', '', [], 'mysql', { rowCount: 3 });
    expect(result.insertSql).toBe('-- 暂无有效字段');
    expect(result.csv).toBe('');
    expect(result.json).toBe('[]');
  });

  it('filters out fields without names', () => {
    const fields = [
      createField({ name: '', type: 'varchar' }),
      createField({ name: '  ', type: 'int' }),
    ];
    const result = generateMockData('users', '', fields, 'mysql', { rowCount: 2 });
    expect(result.insertSql).toBe('-- 暂无有效字段');
  });

  it('generates INSERT SQL for MySQL', () => {
    const fields = [createField({ name: 'id', type: 'bigint', defaultKind: 'auto_increment' })];
    const result = generateMockData('users', '', fields, 'mysql', { rowCount: 2 });
    expect(result.insertSql).toContain('INSERT INTO `users` (`id`)');
    expect(result.insertSql).toContain('VALUES');
    expect(result.insertSql).toContain('(1)');
    expect(result.insertSql).toContain('(2)');
    expect(result.insertSql).toMatch(/;$/);
  });

  it.each(['gbase', 'polardb'] as const)('generates INSERT SQL for %s with backticks', (dbType) => {
    const fields = [createField({ name: 'id', type: 'bigint' })];
    const result = generateMockData('users', '', fields, dbType, { rowCount: 1 });
    expect(result.insertSql).toContain('INSERT INTO `users` (`id`)');
  });

  it('generates INSERT SQL with schema name', () => {
    const fields = [createField({ name: 'id', type: 'bigint', defaultKind: 'auto_increment' })];
    const result = generateMockData('users', 'public', fields, 'postgresql', { rowCount: 1 });
    expect(result.insertSql).toContain('INSERT INTO "public"."users"');
  });

  it('uses table_name fallback when table name is empty', () => {
    const fields = [createField({ name: 'id', type: 'bigint', defaultKind: 'auto_increment' })];
    const result = generateMockData('', '', fields, 'mysql', { rowCount: 1 });
    expect(result.insertSql).toContain('`table_name`');
  });

  it('generates INSERT SQL for SQL Server with bracket quoting', () => {
    const fields = [createField({ name: 'id', type: 'bigint', defaultKind: 'auto_increment' })];
    const result = generateMockData('users', '', fields, 'sqlserver', { rowCount: 1 });
    expect(result.insertSql).toContain('[users]');
    expect(result.insertSql).toContain('[id]');
  });

  it('generates CSV output', () => {
    const fields = [
      createField({ name: 'id', type: 'bigint', defaultKind: 'auto_increment' }),
      createField({ name: 'name', type: 'varchar(50)', defaultKind: 'none' }),
    ];
    const result = generateMockData('users', '', fields, 'mysql', { rowCount: 2 });
    const lines = result.csv.split('\n');
    expect(lines[0]).toBe('id,name');
    expect(lines).toHaveLength(3);
  });

  it('escapes commas in CSV values', () => {
    const fields = [
      createField({
        name: 'address',
        type: 'varchar(100)',
        defaultKind: 'none',
        nullable: true,
      }),
    ];
    const result = generateMockData('users', '', fields, 'mysql', { rowCount: 5 });
    const lines = result.csv.split('\n');
    expect(lines[0]).toBe('address');
    const valuesWithCommas = lines.slice(1).filter((line) => line.includes(','));
    expect(valuesWithCommas.every((line) => /^".*"$/.test(line))).toBe(true);
  });

  it('generates JSON output', () => {
    const fields = [
      createField({ name: 'id', type: 'bigint', defaultKind: 'auto_increment' }),
      createField({ name: 'status', type: 'varchar(20)', defaultKind: 'none' }),
    ];
    const result = generateMockData('users', '', fields, 'mysql', { rowCount: 2 });
    const parsed = JSON.parse(result.json);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toHaveProperty('id');
    expect(parsed[0]).toHaveProperty('status');
  });

  it('handles nullable fields', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.05);
    const fields = [
      createField({ name: 'id', type: 'bigint', defaultKind: 'auto_increment', nullable: false }),
      createField({ name: 'deleted_at', type: 'timestamp', defaultKind: 'none', nullable: true }),
    ];
    try {
      const result = generateMockData('users', '', fields, 'mysql', { rowCount: 20 });
      const parsed = JSON.parse(result.json);
      const hasNull = parsed.some((row: any) => row.deleted_at === null);
      const hasValue = parsed.some((row: any) => row.deleted_at !== null);
      expect(hasNull || !hasValue).toBe(true);
    } finally {
      randomSpy.mockRestore();
    }
  });

  it('generates uuid default values', () => {
    const fields = [createField({ name: 'uuid', type: 'varchar', defaultKind: 'uuid' })];
    const result = generateMockData('users', '', fields, 'mysql', { rowCount: 1 });
    const parsed = JSON.parse(result.json);
    expect(parsed[0].uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('generates current_timestamp default values', () => {
    const fields = [
      createField({ name: 'created_at', type: 'timestamp', defaultKind: 'current_timestamp' }),
    ];
    const result = generateMockData('users', '', fields, 'mysql', { rowCount: 1 });
    const parsed = JSON.parse(result.json);
    expect(parsed[0].created_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it('handles boolean types', () => {
    const fields = [createField({ name: 'is_active', type: 'boolean', defaultKind: 'none' })];
    const result = generateMockData('users', '', fields, 'mysql', { rowCount: 5 });
    const parsed = JSON.parse(result.json);
    for (const row of parsed) {
      expect(typeof row.is_active).toBe('number');
      expect([0, 1]).toContain(row.is_active);
    }
  });

  it('handles tinyint(1) as boolean', () => {
    const fields = [createField({ name: 'is_deleted', type: 'tinyint(1)', defaultKind: 'none' })];
    const result = generateMockData('users', '', fields, 'mysql', { rowCount: 5 });
    const parsed = JSON.parse(result.json);
    for (const row of parsed) {
      expect(typeof row.is_deleted).toBe('number');
      expect([0, 1]).toContain(row.is_deleted);
    }
  });

  it('handles enum types from args', () => {
    const fields = [
      createField({
        name: 'role',
        type: "enum('active','inactive','pending')",
        defaultKind: 'none',
      }),
    ];
    const result = generateMockData('users', '', fields, 'mysql', { rowCount: 10 });
    const parsed = JSON.parse(result.json);
    for (const row of parsed) {
      expect(['active', 'inactive', 'pending']).toContain(row.role);
    }
  });

  it('handles json type', () => {
    const fields = [createField({ name: 'metadata', type: 'json', defaultKind: 'none' })];
    const result = generateMockData('users', '', fields, 'mysql', { rowCount: 1 });
    const parsed = JSON.parse(result.json);
    expect(typeof parsed[0].metadata).toBe('string');
    const jsonValue = JSON.parse(parsed[0].metadata);
    expect(jsonValue).toHaveProperty('id');
    expect(jsonValue).toHaveProperty('value');
  });

  it('handles semantic name inference for phone', () => {
    const fields = [createField({ name: 'phone', type: 'varchar(20)', defaultKind: 'none' })];
    const result = generateMockData('users', '', fields, 'mysql', { rowCount: 5 });
    const parsed = JSON.parse(result.json);
    for (const row of parsed) {
      expect(String(row.phone)).toMatch(/^1[3-9]\d{9}$/);
    }
  });

  it('handles semantic name inference for email', () => {
    const fields = [createField({ name: 'email', type: 'varchar(100)', defaultKind: 'none' })];
    const result = generateMockData('users', '', fields, 'mysql', { rowCount: 3 });
    const parsed = JSON.parse(result.json);
    for (const row of parsed) {
      expect(String(row.email)).toMatch(/^.+@.+\..+$/);
    }
  });

  it('handles semantic name inference for age', () => {
    const fields = [createField({ name: 'age', type: 'int', defaultKind: 'none' })];
    const result = generateMockData('users', '', fields, 'mysql', { rowCount: 10 });
    const parsed = JSON.parse(result.json);
    for (const row of parsed) {
      expect(row.age).toBeGreaterThanOrEqual(18);
      expect(row.age).toBeLessThanOrEqual(75);
    }
  });

  it('handles semantic comment inference', () => {
    const fields = [
      createField({ name: 'u_name', type: 'varchar(50)', defaultKind: 'none', comment: '姓名' }),
    ];
    const result = generateMockData('users', '', fields, 'mysql', { rowCount: 3 });
    const parsed = JSON.parse(result.json);
    for (const row of parsed) {
      expect(typeof row.u_name).toBe('string');
      expect(row.u_name.length).toBeGreaterThan(0);
    }
  });

  it('handles decimal type with precision', () => {
    const fields = [createField({ name: 'price', type: 'decimal(10,2)', defaultKind: 'none' })];
    const result = generateMockData('users', '', fields, 'mysql', { rowCount: 5 });
    const parsed = JSON.parse(result.json);
    for (const row of parsed) {
      expect(typeof row.price).toBe('number');
      const decimalStr = String(row.price);
      const decimalPlaces = decimalStr.includes('.') ? decimalStr.split('.')[1].length : 0;
      expect(decimalPlaces).toBeLessThanOrEqual(2);
    }
  });

  it('handles float type', () => {
    const fields = [createField({ name: 'score', type: 'float', defaultKind: 'none' })];
    const result = generateMockData('users', '', fields, 'mysql', { rowCount: 3 });
    const parsed = JSON.parse(result.json);
    for (const row of parsed) {
      expect(typeof row.score).toBe('number');
    }
  });

  it('handles date type', () => {
    const fields = [createField({ name: 'birth_date', type: 'date', defaultKind: 'none' })];
    const result = generateMockData('users', '', fields, 'mysql', { rowCount: 3 });
    const parsed = JSON.parse(result.json);
    for (const row of parsed) {
      expect(String(row.birth_date)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('handles time type', () => {
    const fields = [createField({ name: 'start_time', type: 'time', defaultKind: 'none' })];
    const result = generateMockData('users', '', fields, 'mysql', { rowCount: 2 });
    const parsed = JSON.parse(result.json);
    for (const row of parsed) {
      expect(String(row.start_time)).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    }
  });

  it('formats SQL values correctly', () => {
    const fields = [
      createField({ name: 'id', type: 'bigint', defaultKind: 'auto_increment' }),
      createField({ name: 'name', type: 'varchar(50)', defaultKind: 'none' }),
    ];
    const result = generateMockData('users', '', fields, 'mysql', { rowCount: 1 });
    expect(result.insertSql).toContain('(`id`, `name`)');
  });
});

describe('downloadFile', () => {
  it('creates blob and triggers download', () => {
    const createObjectURL = vi.fn(() => 'blob:test');
    const revokeObjectURL = vi.fn();
    const click = vi.fn();

    Object.assign(globalThis.URL, {
      createObjectURL,
      revokeObjectURL,
    });

    const createElement = vi.fn(() => ({ click, href: '', download: '' }));
    vi.stubGlobal('document', { createElement });

    downloadFile('test content', 'test.sql', 'text/plain');

    expect(createObjectURL).toHaveBeenCalled();
    expect(createElement).toHaveBeenCalledWith('a');
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test');

    vi.unstubAllGlobals();
  });
});
