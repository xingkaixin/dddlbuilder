import { describe, expect, it } from 'vitest';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { buildSelectQuery, getQueryRelations, type QueryDesign } from '../utils/queryDesigner';
import { snapshotTableKey } from '../utils/schemaSnapshot';

export function queryFixture(dbType: 'mysql' | 'postgresql' = 'mysql'): PersistedState[] {
  const users: PersistedState = {
    dbType,
    tableName: 'users',
    schemaName: '',
    tableComment: '',
    authInput: '',
    authObjects: [],
    sqlFormatMode: 'compact',
    addCount: 1,
    indexes: [],
    rows: [
      { id: 'id', fieldName: 'id', fieldType: 'int', fieldComment: '', nullable: false },
      {
        id: 'name',
        fieldName: 'name',
        fieldType: 'varchar(30)',
        fieldComment: '',
        nullable: false,
      },
    ],
  };
  const orders: PersistedState = {
    ...users,
    tableName: 'orders',
    rows: [
      { ...users.rows[0], fieldName: 'user_id' },
      { ...users.rows[1], fieldName: 'amount', fieldType: 'decimal(12,2)' },
    ],
    foreignKeys: [
      { id: 'fk', name: 'fk_user', fields: ['user_id'], refTable: 'users', refFields: ['id'] },
    ],
  };

  return [users, orders];
}

function query(tables: PersistedState[]): QueryDesign {
  const [users, orders] = tables;
  const userField = { table: snapshotTableKey(users), field: 'name' };

  return {
    root: snapshotTableKey(users),
    joins: [{ relation: getQueryRelations(tables)[0].id, type: 'LEFT' }],
    columns: [
      { ...userField, aggregate: '', alias: 'customer' },
      { table: snapshotTableKey(orders), field: 'amount', aggregate: 'SUM', alias: 'total' },
    ],
    filters: [
      { ...userField, operator: '=', value: "x' OR 1=1 --" },
      { ...userField, operator: 'IS NOT NULL', value: '' },
    ],
    groupBy: [userField],
    orderBy: [{ column: 1, direction: 'DESC' }],
    limit: 20,
  };
}

describe('query designer', () => {
  it.each(['mysql', 'postgresql'] as const)(
    'generates a grouped parameterized %s join without interpolating data',
    (dialect) => {
      const tables = queryFixture(dialect);
      const result = buildSelectQuery(tables, query(tables));
      expect(result.sql).toContain('LEFT JOIN');
      expect(result.sql).toContain('SUM(t2.');
      expect(result.sql).toContain('GROUP BY t1.');
      expect(result.sql).toContain('ORDER BY 2 DESC\nLIMIT 20;');
      expect(result.sql).toContain(dialect === 'mysql' ? '= ?' : '= $1');
      expect(result.sql).not.toContain('OR 1=1');
      expect(result.parameters).toEqual(["x' OR 1=1 --"]);
    },
  );
  it('keeps composite relations together and exposes distinct alternatives', () => {
    const tables = queryFixture();
    tables[1].foreignKeys?.push({
      id: 'other',
      name: 'alternate',
      fields: ['user_id', 'amount'],
      refTable: 'users',
      refFields: ['id', 'name'],
      logical: { cardinality: 'many-to-one', optionality: 'optional' },
    });
    const design = query(tables);
    design.joins[0].relation = getQueryRelations(tables)[1].id;
    expect(buildSelectQuery(tables, design).sql).toContain(
      't2.`user_id` = t1.`id` AND t2.`amount` = t1.`name`',
    );
    expect(getQueryRelations(tables)[1].logical).toBe(true);
  });
  it('rejects missing grouping, unjoined fields and duplicate aliases', () => {
    const tables = queryFixture();
    const design = query(tables);
    expect(() => buildSelectQuery(tables, { ...design, groupBy: [] })).toThrow('grouped');
    expect(() => buildSelectQuery(tables, { ...design, joins: [] })).toThrow('unjoined');
    expect(() =>
      buildSelectQuery(tables, {
        ...design,
        columns: design.columns.map((column) => ({ ...column, alias: 'same' })),
      }),
    ).toThrow('Duplicate');
    expect(() => buildSelectQuery(tables, { ...design, limit: 0 })).toThrow('LIMIT');
    expect(() =>
      buildSelectQuery(tables, { ...design, orderBy: [{ column: 9, direction: 'ASC' }] }),
    ).toThrow('ordering');
  });
  it('supports COUNT(*) and rejects incompatible aggregates and LIKE', () => {
    const tables = queryFixture();
    const design = query(tables);
    expect(
      buildSelectQuery(tables, {
        ...design,
        columns: [{ table: design.root, field: '*', aggregate: 'COUNT', alias: 'count' }],
        orderBy: [],
      }).sql,
    ).toContain('COUNT(*)');
    expect(() =>
      buildSelectQuery(tables, {
        ...design,
        columns: [{ ...design.columns[0], aggregate: 'SUM' }],
      }),
    ).toThrow('numeric');
    expect(() =>
      buildSelectQuery(tables, {
        ...design,
        filters: [{ table: design.root, field: 'id', operator: 'LIKE', value: '%' }],
      }),
    ).toThrow('text field');
  });
  it('rejects mixed dialects, views, ambiguous models and invalid relationships', () => {
    const tables = queryFixture();
    expect(() => getQueryRelations([tables[0], { ...tables[1], dbType: 'postgresql' }])).toThrow(
      'one MySQL',
    );
    expect(() => getQueryRelations([{ ...tables[0], objectType: 'view' }])).toThrow('ordinary');
    expect(() => getQueryRelations([tables[0], tables[0]])).toThrow('duplicate');
    expect(() =>
      getQueryRelations([{ ...tables[0], rows: [tables[0].rows[0], tables[0].rows[0]] }]),
    ).toThrow('duplicate');
    const relation = tables[1].foreignKeys?.[0];

    if (!relation) throw new Error('Missing test relationship');
    relation.refFields = ['missing'];
    expect(() => getQueryRelations(tables)).toThrow('Invalid relationship');
  });
});
