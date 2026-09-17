import { describe, expect, it } from 'vitest';
import type { PersistedState, FieldRow } from '@ddlbuilder/shared-types';
import type { SeedRule } from '@ddlbuilder/shared-types/api';
import { decodeSeedScenario } from '@ddlbuilder/shared-types/api';
import { refreshSchemaSnapshot } from '../utils/schemaRefresh';
import { assessMysqlToPostgres } from '../utils/migrationAssessment';
import { generateRelationalSeed } from '../utils/relationalSeed';
import { snapshotTableKey } from '../utils/schemaSnapshot';

const field = (fieldName: string, fieldType = 'int', nullable = false): FieldRow => ({
  id: fieldName,
  fieldName,
  fieldType,
  nullable,
  fieldComment: '',
});
const table = (tableName: string, rows: FieldRow[]): PersistedState => ({
  tableName,
  schemaName: '',
  dbType: 'mysql',
  tableComment: '',
  rows,
  indexes: [],
  sqlFormatMode: 'compact',
  addCount: 1,
  authInput: '',
  authObjects: [],
});
const data = table('orders', [
  field('id'),
  field('amount', 'decimal(20,2)'),
  field('state', 'varchar(10)'),
  field('created', 'date'),
  field('due', 'datetime'),
  field('note', 'varchar(10)', true),
]);
const base = { tableKey: snapshotTableKey(data), nullPercent: 0 };
const generate = (rules: SeedRule[], count = 40) =>
  generateRelationalSeed([{ table: data, rowCount: count }], 'scenario', false, rules);

describe('schema refresh', () => {
  it('takes physical structure from the new source while retaining matched business metadata', () => {
    const before = table('users', [
      {
        ...field('ID'),
        id: 'stable',
        fieldComment: 'Business ID',
        standardId: 'identity',
        enumMeta: [{ value: '1' }],
      },
    ]);
    before.tableComment = 'Business users';
    before.foreignKeys = [
      {
        id: 'logical',
        name: 'logical',
        fields: ['ID'],
        refTable: 'removed',
        refFields: ['id'],
        logical: { cardinality: 'many-to-one', optionality: 'required' },
      },
    ];
    const incoming = table('users', [field('id', 'bigint'), field('email', 'varchar(30)')]);
    const original = JSON.stringify([before, incoming]);

    const result = refreshSchemaSnapshot(
      [before, table('removed', [field('id')])],
      [incoming, table('new', [field('id')])],
    );
    expect(result).toMatchObject({ added: ['new'], removed: ['removed'] });
    expect(result.tables[0]).toMatchObject({
      tableComment: 'Business users',
      rows: [
        {
          id: 'stable',
          fieldType: 'bigint',
          fieldComment: 'Business ID',
          standardId: 'identity',
          enumMeta: [{ value: '1' }],
        },
        { fieldName: 'email' },
      ],
      foreignKeys: [],
    });
    expect(result.warnings).toHaveLength(1);
    expect(JSON.stringify([before, incoming])).toBe(original);
    expect(
      refreshSchemaSnapshot(result.tables, [incoming, table('new', [field('id')])]).added,
    ).toEqual([]);
  });

  it('keeps valid logical relations and rejects ambiguous table identities and mixed dialects', () => {
    const before = table('users', [field('id')]);
    before.foreignKeys = [
      {
        id: 'self',
        name: 'self',
        fields: ['id'],
        refTable: 'users',
        refFields: ['id'],
        logical: { cardinality: 'many-to-one', optionality: 'required' },
      },
    ];
    expect(
      refreshSchemaSnapshot([before], [table('users', [field('id')])]).tables[0].foreignKeys,
    ).toEqual(before.foreignKeys);
    expect(() => refreshSchemaSnapshot([], [before, before])).toThrow('duplicate');
    expect(() => refreshSchemaSnapshot([before], [{ ...before, dbType: 'postgresql' }])).toThrow(
      'dialect',
    );
  });
});

describe('business seed scenarios', () => {
  it('reproduces exact decimals, weighted values, nulls and dependent dates', () => {
    const rules: SeedRule[] = [
      {
        ...base,
        field: 'amount',
        kind: 'range',
        min: '9007199254740993.10',
        max: '9007199254740993.12',
      },
      {
        ...base,
        field: 'state',
        kind: 'weighted',
        values: [
          { value: 'paid', weight: 90 },
          { value: 'pending', weight: 10 },
        ],
      },
      { ...base, field: 'due', kind: 'offset', source: 'created', days: 7 },
      { ...base, field: 'created', kind: 'date', start: '2026-09-01', end: '2026-09-03' },
      { ...base, field: 'note', kind: 'default', nullPercent: 100 },
    ];
    const result = generate(rules, 100);
    expect(generate([...rules].reverse(), 100)).toEqual(result);
    const rows = result.tables[0].rows;

    for (const row of rows) {
      expect(['9007199254740993.10', '9007199254740993.11', '9007199254740993.12']).toContain(
        row.amount,
      );
      expect(row.note).toBeNull();
      expect(
        Date.parse(String(row.due).replace(' ', 'T') + 'Z') -
          Date.parse(String(row.created) + 'T00:00:00Z'),
      ).toBe(7 * 86400000);
    }

    expect(rows.filter((row) => row.state === 'paid').length).toBeGreaterThan(70);
    expect(rows.some((row) => row.state === 'pending')).toBe(true);
    expect(result.sql).toContain('9007199254740993.');
  });

  it('rejects missing rules, invalid ranges and date cycles before exporting data', () => {
    const bad: SeedRule[] = [
      { ...base, field: 'missing', kind: 'default' },
      { ...base, tableKey: 'missing', field: 'id', kind: 'default' },
      { ...base, field: 'id', kind: 'default', nullPercent: 1 },
      { ...base, field: 'id', kind: 'range', min: '2', max: '1' },
      { ...base, field: 'id', kind: 'range', min: '0.1', max: '2' },
      { ...base, field: 'state', kind: 'range', min: '1', max: '2' },
      { ...base, field: 'amount', kind: 'range', min: '1.001', max: '2' },
      { ...base, field: 'created', kind: 'date', start: '2026-02-30', end: '2026-03-01' },
      { ...base, field: 'created', kind: 'date', start: '2026-03-02', end: '2026-03-01' },
      { ...base, field: 'created', kind: 'offset', source: 'state', days: 1 },
    ];

    for (const rule of bad) expect(() => generate([rule])).toThrow(Error);
    expect(() =>
      generate([
        { ...base, field: 'created', kind: 'offset', source: 'due', days: 1 },
        { ...base, field: 'due', kind: 'offset', source: 'created', days: 1 },
      ]),
    ).toThrow('cyclic');
    expect(() =>
      generate([
        { ...base, field: 'id', kind: 'default' },
        { ...base, field: 'id', kind: 'default' },
      ]),
    ).toThrow('duplicate');
  });

  it('protects primary keys and foreign keys with database identifier matching', () => {
    const parent = table('parents', [field('id', 'int', true)]);
    parent.indexes = [
      { id: 'pk', name: 'pk', kind: 'primary', fields: [{ name: 'ID', direction: 'ASC' }] },
    ];
    const child = table('children', [field('parent_id')]);
    child.foreignKeys = [
      { id: 'fk', name: 'fk', fields: ['PARENT_ID'], refTable: 'parents', refFields: ['ID'] },
    ];
    expect(() =>
      generateRelationalSeed([{ table: parent, rowCount: 1 }], 'test', false, [
        { tableKey: snapshotTableKey(parent), field: 'id', kind: 'default', nullPercent: 100 },
      ]),
    ).toThrow('NULL');
    expect(() =>
      generateRelationalSeed(
        [
          { table: parent, rowCount: 1 },
          { table: child, rowCount: 2 },
        ],
        'test',
        false,
        [
          {
            tableKey: snapshotTableKey(child),
            field: 'parent_id',
            kind: 'range',
            min: '1',
            max: '2',
            nullPercent: 0,
          },
        ],
      ),
    ).toThrow('foreign-key');
  });

  it('rejects impossible unique distributions and values outside the physical enumeration', () => {
    const status = table('status', [field('id', "enum('A','B')")]);
    status.indexes = [
      { id: 'pk', name: 'pk', kind: 'primary', fields: [{ name: 'id', direction: 'ASC' }] },
    ];

    const rule: SeedRule = {
      tableKey: snapshotTableKey(status),
      field: 'id',
      kind: 'weighted',
      nullPercent: 0,
      values: [{ value: 'A', weight: 1 }],
    };
    expect(() =>
      generateRelationalSeed([{ table: status, rowCount: 2 }], 'test', false, [rule]),
    ).toThrow('unique');
    expect(() =>
      generateRelationalSeed([{ table: status, rowCount: 1 }], 'test', false, [
        { ...rule, values: [{ value: 'C', weight: 1 }] },
      ]),
    ).toThrow('ENUM');
    expect(() =>
      decodeSeedScenario({
        version: 1,
        name: 'test',
        seed: 'test',
        includeLogical: false,
        rows: [],
        rules: [{ ...rule, nullPercent: 101 }],
      }),
    ).toThrow(Error);
  });
});

describe('MySQL migration assessment', () => {
  it('keeps lossy conversions and behavioral changes visible without claiming executable output', () => {
    const source = table('mixed', [
      field('plain'),
      field('unsigned', 'bigint unsigned'),
      field('money', 'decimal(12,2)'),
      field('name', 'varchar(30)'),
      field('clock', 'timestamp'),
      field('duration', 'time'),
      field('doc', 'json'),
      field('binary', 'blob'),
      field('enum', "enum('a','b')"),
      field('geo', 'geometry'),
      { ...field('identity'), defaultKind: 'auto_increment' },
      {
        ...field('updated', 'datetime'),
        defaultKind: 'constant',
        defaultValue: '0000-00-00',
        onUpdate: 'current_timestamp',
      },
    ]);
    const before = JSON.stringify(source);
    const result = assessMysqlToPostgres([source]);
    expect(result).toContainEqual(
      expect.objectContaining({ object: 'mixed.plain', level: 'mapped', target: 'integer' }),
    );
    expect(result).toContainEqual(
      expect.objectContaining({
        object: 'mixed.unsigned',
        level: 'manual',
        target: 'numeric(20,0)',
      }),
    );
    expect(result).toContainEqual(
      expect.objectContaining({ object: 'mixed.money', level: 'mapped', target: 'numeric(12,2)' }),
    );
    expect(result).toContainEqual(
      expect.objectContaining({ object: 'mixed.geo', level: 'unsupported' }),
    );
    expect(result.map((item) => item.reason)).toEqual(
      expect.arrayContaining([
        'identifiers',
        'identity',
        'zeroDate',
        'onUpdate',
        'timezone',
        'duration',
        'json',
        'enum',
      ]),
    );
    expect(JSON.stringify(source)).toBe(before);
    expect(assessMysqlToPostgres([{ ...source, objectType: 'view' }])).toEqual([
      expect.objectContaining({ level: 'unsupported', reason: 'view' }),
    ]);
    expect(() => assessMysqlToPostgres([{ ...source, dbType: 'postgresql' }])).toThrow('MySQL');
  });
});
