import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DATA_IMPORT_OPTIONS,
  inferDataImportColumns,
  newDataImportTarget,
  validateBusinessData,
  type BusinessData,
  type DataImportColumn,
} from '../index.js';

const options = DEFAULT_DATA_IMPORT_OPTIONS;
const data: BusinessData = {
  headers: ['code', 'amount', 'id', 'created'],
  rows: [
    { line: 2, values: ['00123', '9007199254740993.01', '9007199254740993', '2024-02-29'] },
    { line: 3, values: ['00456', '0.10', '9007199254740994', '2024-03-01'] },
  ],
};

describe('business data import', () => {
  it('preserves identifiers and exact numeric values through inference and SQL export', () => {
    const columns = inferDataImportColumns(data, 'postgresql', options);
    expect(columns.map((column) => column.type)).toEqual([
      'varchar(5)',
      'decimal(18,2)',
      'bigint',
      'date',
    ]);

    const result = validateBusinessData(
      data,
      newDataImportTarget('postgresql', 'orders', 'sales', columns),
      columns,
      options,
      true,
    );
    expect(result.issues).toEqual([]);
    expect(result.sql).toContain('CREATE TABLE');
    expect(result.sql).toContain('INSERT INTO "sales"."orders"');
    expect(result.sql).toContain("E'00123', 9007199254740993.01, 9007199254740993, E'2024-02-29'");
  });

  it('scans all values, keeps huge integers as text, and does not guess regional dates', () => {
    const source = {
      headers: ['a', 'b', 'c'],
      rows: [
        { line: 2, values: ['999999999999999999999', '01/02/2024', 'true'] },
        { line: 3, values: ['1', '', 'false'] },
      ],
    };
    expect(
      inferDataImportColumns(source, 'mysql', options).map((column) => [
        column.type,
        column.nullable,
      ]),
    ).toEqual([
      ['text', false],
      ['varchar(10)', true],
      ['boolean', false],
    ]);
    expect(inferDataImportColumns(source, 'mysql', { ...options, dateFormat: 'dmy' })[1].type).toBe(
      'date',
    );
  });

  it.each([
    ['mysql', "_utf8mb4 X'4f27427269656e5c6e0ae4b8ad'"],
    ['postgresql', "E'O''Brien\\\\n\n中'"],
  ] as const)(
    'escapes text as data in %s independently of ordinary string modes',
    (dbType, literal) => {
      const source = { headers: ['note'], rows: [{ line: 2, values: ["O'Brien\\n\n中"] }] };
      const columns = inferDataImportColumns(source, dbType, options);

      const result = validateBusinessData(
        source,
        newDataImportTarget(dbType, 'notes', '', columns),
        columns,
        options,
        false,
      );
      expect(result.sql).toContain(literal);
      expect(result.sql).not.toContain('CREATE TABLE');
    },
  );

  it.each([
    ['smallint', '32768', 'range'],
    ['int unsigned', '-1', 'range'],
    ['decimal(4,2)', '123.45', 'precision'],
    ['decimal(4,2)', '1.234', 'precision'],
    ['varchar(2)', 'abc', 'length'],
    ['date', '2023-02-29', 'value'],
    ['datetime', '2024-01-01 25:00:00', 'value'],
    ['boolean', 'yes', 'value'],
    ['json', '{', 'value'],
    ['text', 'a\0b', 'nullCharacter'],
    ['text', '\ud800', 'nullCharacter'],
    ['geometry', 'anything', 'type'],
    ["enum('a','b')", 'c', 'enum'],
  ])('reports %s failures with the original row and blocks all SQL', (type, raw, code) => {
    const source = { headers: ['value'], rows: [{ line: 42, values: [raw] }] };
    const columns: DataImportColumn[] = [{ source: 'value', name: 'value', type, nullable: false }];

    const result = validateBusinessData(
      source,
      newDataImportTarget('mysql', 'items', '', columns),
      columns,
      options,
      true,
    );
    expect(result.sql).toBe('');
    expect(result.issues[0]).toMatchObject({
      code,
      field: 'value',
      ...(code === 'type' ? { line: 0 } : { line: 42, value: raw }),
    });
  });

  it('validates compound unique keys after numeric normalization and allows SQL NULLs', () => {
    const source = {
      headers: ['a', 'b'],
      rows: [
        { line: 2, values: ['01', 'x'] },
        { line: 3, values: ['1', 'y'] },
        { line: 4, values: ['1', 'x'] },
        { line: 5, values: ['2', ''] },
        { line: 6, values: ['2', ''] },
      ],
    };
    const columns: DataImportColumn[] = [
      { source: 'a', name: 'a', type: 'int', nullable: false },
      { source: 'b', name: 'b', type: 'text', nullable: true },
    ];
    const target = newDataImportTarget('postgresql', 'items', '', columns);
    target.indexes = [
      {
        id: 'u',
        name: 'uq_pair',
        kind: 'unique_constraint',
        fields: [
          { name: 'a', direction: 'ASC' },
          { name: 'b', direction: 'ASC' },
        ],
      },
    ];
    const result = validateBusinessData(source, target, columns, options, false);
    expect(result.issues).toEqual([
      { code: 'duplicate', field: 'uq_pair', detail: '2', line: 4, value: '1 / x' },
    ]);
    expect(result.sql).toBe('');
  });

  it('omits default fields but rejects explicitly mapped NULL and missing required fields', () => {
    const source = { headers: ['id', 'name'], rows: [{ line: 2, values: ['', 'Alice'] }] };
    const columns = inferDataImportColumns(source, 'mysql', options);
    const target = newDataImportTarget('mysql', 'users', '', columns);
    target.fields[0] = {
      ...target.fields[0],
      type: 'bigint',
      nullable: false,
      defaultKind: 'auto_increment',
    };
    expect(validateBusinessData(source, target, columns, options, false).issues[0].code).toBe(
      'required',
    );
    columns[0].source = null;
    const result = validateBusinessData(source, target, columns, options, false);
    expect(result.issues).toEqual([]);
    expect(result.columns).toEqual(['name']);
    target.fields[0].defaultKind = 'none';
    expect(validateBusinessData(source, target, columns, options, false).issues[0].code).toBe(
      'required',
    );
  });

  it('applies trimming, empty values, regional dates and logical enums explicitly', () => {
    const source = {
      headers: ['day', 'status'],
      rows: [{ line: 2, values: [' 31/12/2024 ', ''] }],
    };
    const columns: DataImportColumn[] = [
      { source: 'day', name: 'day', type: 'date', nullable: false },
      { source: 'status', name: 'status', type: 'text', nullable: false },
    ];
    const target = newDataImportTarget('postgresql', 'items', '', columns);

    const result = validateBusinessData(
      source,
      target,
      columns,
      { dateFormat: 'dmy', trim: true, emptyAsNull: false },
      false,
    );
    expect(result.sql).toContain("E'2024-12-31', E''");
    target.fields[1].enumMeta = [{ value: 'open' }];
    expect(
      validateBusinessData(
        source,
        target,
        columns,
        { dateFormat: 'dmy', trim: true, emptyAsNull: false },
        false,
      ).issues[0].code,
    ).toBe('enum');
  });

  it('rejects SQL fragments in types and identifiers and missing mappings', () => {
    const columns = inferDataImportColumns(data, 'mysql', options);
    columns[0].type = 'int); DROP TABLE users; --';
    columns[1].name = 'amount;DELETE';
    columns[2].source = 'missing';

    const result = validateBusinessData(
      data,
      newDataImportTarget('mysql', 'orders', '', columns),
      columns,
      options,
      true,
    );
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['name', 'type', 'source']),
    );
    expect(result.sql).toBe('');
  });
});
