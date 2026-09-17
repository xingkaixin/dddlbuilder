import { describe, expect, it } from 'vitest';
import { decodeDeliverySnapshot, encodeDeliverySnapshot } from '../deliverySnapshot';
import type { PersistedState } from '@ddlbuilder/shared-types';

const table: PersistedState = {
  tableName: 'users',
  schemaName: '',
  dbType: 'mysql',
  tableComment: 'Users',
  rows: [
    {
      id: 'id',
      fieldName: 'id',
      fieldType: 'int',
      fieldComment: 'Business ID',
      nullable: false,
      standardId: 'id',
    },
  ],
  indexes: [],
  addCount: 1,
  sqlFormatMode: 'compact',
  authInput: '',
  authObjects: [],
};
const snapshot = {
  format: 'ddlbuilder-schema',
  version: 1,
  tables: [table],
  standards: [{ id: 'id', name: 'Identifier', unit: '', description: 'Stable key' }],
};

describe('portable schema snapshots', () => {
  it('retains field identity and standard descriptions across repeated exports', () => {
    const decoded = decodeDeliverySnapshot(snapshot);
    expect(decoded.tables[0]).toMatchObject(table);
    expect(decoded.standards).toEqual(snapshot.standards);
    expect(decodeDeliverySnapshot(JSON.parse(encodeDeliverySnapshot(decoded)))).toEqual(decoded);
  });
  it('rejects malformed and lossy snapshots without accepting partial tables', () => {
    for (const input of [
      null,
      { ...snapshot, version: 2 },
      { ...snapshot, tables: [table, table] },
      { ...snapshot, tables: [{ ...table, rows: [null] }] },
      { ...snapshot, tables: [{ ...table, rows: [{ ...table.rows[0], nullable: 'yes' }] }] },
      { ...snapshot, tables: [{ ...table, indexes: [{}] }] },
      { ...snapshot, standards: [...snapshot.standards, ...snapshot.standards] },
      {
        ...snapshot,
        tables: Array.from({ length: 201 }, (_, index) => ({ ...table, tableName: `t${index}` })),
      },
    ])
      expect(() => decodeDeliverySnapshot(input)).toThrow(Error);
  });
});
