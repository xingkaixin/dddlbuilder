import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import type { PersistedState, FieldRow, ForeignKeyDefinition } from '@ddlbuilder/shared-types';
import { generateRelationalSeed } from '../utils/relationalSeed';

function field(fieldName: string, fieldType = 'int'): FieldRow {
  return { id: fieldName, fieldName, fieldType, fieldComment: '', nullable: false };
}

function table(
  tableName: string,
  rows: FieldRow[],
  primary = ['id'],
  foreignKeys: ForeignKeyDefinition[] = [],
): PersistedState {
  return {
    tableName,
    schemaName: '',
    dbType: 'mysql',
    tableComment: '',
    rows,
    indexes: [
      {
        id: 'pk',
        name: `pk_${tableName}`,
        kind: 'primary',
        fields: primary.map((name) => ({ name, direction: 'ASC' })),
      },
    ],
    foreignKeys,
    sqlFormatMode: 'compact',
    addCount: 1,
    authInput: '',
    authObjects: [],
  };
}

const parents = table(
  'parents',
  [field('tenant_id'), field('id'), field('name', 'varchar(12)')],
  ['tenant_id', 'id'],
);
const children = table(
  'children',
  [field('id'), field('tenant_id'), field('parent_id')],
  ['id'],
  [
    {
      id: 'fk_parent',
      name: 'fk_parent',
      fields: ['tenant_id', 'parent_id'],
      refTable: 'parents',
      refFields: ['tenant_id', 'id'],
    },
  ],
);

describe('relational test datasets', () => {
  it('reproduces data independent of selection order and inserts valid composite references', () => {
    const inputs = [
      { table: children, rowCount: 12 },
      { table: parents, rowCount: 4 },
    ];
    const result = generateRelationalSeed(inputs, 'test');
    expect(generateRelationalSeed([...inputs].reverse(), 'test')).toEqual(result);
    expect(generateRelationalSeed(inputs, 'another').json).not.toBe(result.json);
    const database = new DatabaseSync(':memory:');

    try {
      database.exec(
        'PRAGMA foreign_keys = ON; CREATE TABLE parents(tenant_id INT NOT NULL, id INT NOT NULL, name VARCHAR(12), PRIMARY KEY(tenant_id,id)); CREATE TABLE children(id INT PRIMARY KEY, tenant_id INT NOT NULL, parent_id INT NOT NULL, FOREIGN KEY(tenant_id,parent_id) REFERENCES parents(tenant_id,id));',
      );
      database.exec(result.sql);
      expect(
        database
          .prepare(
            'SELECT count(*) AS n FROM children JOIN parents ON children.tenant_id=parents.tenant_id AND children.parent_id=parents.id',
          )
          .get(),
      ).toMatchObject({ n: 12 });
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      database.close();
    }
  });

  it('fills a composite unique key across independent relationships', () => {
    const a = table('a', [field('id')]);
    const b = table('b', [field('id')]);

    const join = table(
      'links',
      [field('a_id'), field('b_id')],
      ['a_id', 'b_id'],
      [
        { id: 'a', name: 'fk_a', fields: ['a_id'], refTable: 'a', refFields: ['id'] },
        { id: 'b', name: 'fk_b', fields: ['b_id'], refTable: 'b', refFields: ['id'] },
      ],
    );
    const result = generateRelationalSeed(
      [
        { table: a, rowCount: 10 },
        { table: b, rowCount: 10 },
        { table: join, rowCount: 100 },
      ],
      'matrix',
    );
    expect(result.tables.find((item) => item.name === 'links')?.rows).toHaveLength(100);
  });

  it('rejects exhausted keys, missing parents and cycles without returning partial data', () => {
    const limited = table('status', [
      { ...field('id', 'varchar(8)'), enumMeta: [{ value: 'A' }, { value: 'B' }] },
    ]);
    expect(() => generateRelationalSeed([{ table: limited, rowCount: 3 }], 'seed')).toThrow(
      'unique',
    );
    expect(() => generateRelationalSeed([{ table: children, rowCount: 1 }], 'seed')).toThrow(
      'include referenced table',
    );

    const self = table(
      'self',
      [field('id'), field('parent')],
      ['id'],
      [{ id: 'self', name: 'fk_self', fields: ['parent'], refTable: 'self', refFields: ['id'] }],
    );
    expect(() => generateRelationalSeed([{ table: self, rowCount: 1 }], 'seed')).toThrow('Cyclic');
  });

  it('preserves bigint and decimal precision and escapes SQL values', () => {
    const precise = table('precise', [
      { ...field('id', 'bigint'), enumMeta: [{ value: '9007199254740993' }] },
      { ...field('amount', 'decimal(22,4)'), enumMeta: [{ value: '-90071992547409.0123' }] },
      { ...field('label', 'varchar(40)'), enumMeta: [{ value: "O'Reilly\\path" }] },
    ]);
    const result = generateRelationalSeed([{ table: precise, rowCount: 1 }], 'seed');
    expect(result.tables[0].rows[0]).toMatchObject({
      id: '9007199254740993',
      amount: '-90071992547409.0123',
    });
    expect(result.sql).toContain("9007199254740993, -90071992547409.0123, 'O''Reilly\\\\path'");

    const fractional = {
      ...precise,
      rows: [{ ...field('id', 'decimal(4,3)'), enumMeta: [{ value: '-0.120' }] }],
    };
    expect(
      generateRelationalSeed([{ table: fractional, rowCount: 1 }], 'seed').tables[0].rows[0].id,
    ).toBe('-0.12');
    const invalid = { ...precise, rows: [field('id', 'geometry')] };
    expect(() => generateRelationalSeed([{ table: invalid, rowCount: 1 }], 'seed')).toThrow(
      'unsupported',
    );
  });
});
