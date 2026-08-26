import { describe, expect, it } from 'vitest';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { applySchemaPatchOperations, parseSchemaPatchOperations } from '@/webmcp/schemaPatch';

const createState = (): PersistedState => ({
  objectType: 'table',
  schemaName: 'public',
  tableName: 'orders',
  tableComment: 'Orders',
  dbType: 'postgresql-citus',
  sqlFormatMode: 'compact',
  rows: [
    {
      id: 'field-id',
      fieldName: 'id',
      fieldType: 'bigint',
      fieldComment: '',
      nullable: false,
      defaultKind: 'none',
      defaultValue: '',
      onUpdate: 'none',
    },
    {
      id: 'field-user',
      fieldName: 'user_id',
      fieldType: 'bigint',
      fieldComment: '',
      nullable: false,
      defaultKind: 'none',
      defaultValue: '',
      onUpdate: 'none',
    },
  ],
  addCount: 10,
  indexInput: '',
  currentIndexFields: [{ name: 'user_id', direction: 'ASC' }],
  indexes: [
    {
      id: 'index-user',
      name: 'idx_orders_user_id',
      fields: [{ name: 'user_id', direction: 'ASC' }],
      unique: false,
    },
  ],
  authInput: '',
  authObjects: [],
  foreignKeys: [
    {
      id: 'fk-user',
      name: 'fk_orders_user',
      fields: ['user_id'],
      refTable: 'users',
      refFields: ['id'],
    },
  ],
  citusShardingConfig: { mode: 'distributed', distributionColumn: 'user_id' },
  mysqlPartitionConfig: {
    enabled: true,
    type: 'RANGE',
    columns: ['user_id'],
    expression: 'YEAR(user_id)',
  },
  tableMiscConfig: {
    enabled: true,
    partitions: {
      enabled: true,
      columns: [],
      clustering: { enabled: true, columns: ['user_id'], bucketCount: 8 },
    },
  },
});

describe('WebMCP schema patch', () => {
  it('parses field additions with deterministic operation ids and defaults', () => {
    const operations = parseSchemaPatchOperations([
      {
        kind: 'field.add',
        field: { fieldName: 'status', fieldType: 'varchar(32)', nullable: false },
      },
    ]);

    expect(operations).toEqual([
      {
        id: 'operation-1',
        kind: 'field.add',
        field: {
          fieldName: 'status',
          fieldType: 'varchar(32)',
          fieldComment: '',
          nullable: false,
          defaultKind: 'none',
          defaultValue: '',
          onUpdate: 'none',
        },
      },
    ]);
  });

  it('renames every document reference together with the field', () => {
    const next = applySchemaPatchOperations(createState(), [
      {
        id: 'rename-user',
        kind: 'field.update',
        fieldId: 'field-user',
        changes: { fieldName: 'account_id' },
      },
    ]);

    expect(next.rows[1].fieldName).toBe('account_id');
    expect(next.currentIndexFields[0].name).toBe('account_id');
    expect(next.indexes[0].fields[0].name).toBe('account_id');
    expect(next.foreignKeys?.[0].fields).toEqual(['account_id']);
    expect(next.citusShardingConfig?.distributionColumn).toBe('account_id');
    expect(next.mysqlPartitionConfig?.columns).toEqual(['account_id']);
    expect(next.mysqlPartitionConfig?.expression).toBe('YEAR(account_id)');
    expect(next.tableMiscConfig?.partitions?.clustering?.columns).toEqual(['account_id']);
  });

  it('removes dependent definitions when a referenced field is deleted', () => {
    const next = applySchemaPatchOperations(createState(), [
      { id: 'remove-user', kind: 'field.remove', fieldId: 'field-user' },
    ]);

    expect(next.rows.map((row) => row.id)).toEqual(['field-id']);
    expect(next.indexes).toEqual([]);
    expect(next.foreignKeys).toEqual([]);
    expect(next.citusShardingConfig).toEqual({ mode: 'reference', distributionColumn: undefined });
    expect(next.mysqlPartitionConfig?.enabled).toBe(false);
  });

  it('rejects duplicate field names instead of producing an invalid document', () => {
    expect(() =>
      applySchemaPatchOperations(createState(), [
        {
          id: 'duplicate-id',
          kind: 'field.update',
          fieldId: 'field-user',
          changes: { fieldName: 'id' },
        },
      ]),
    ).toThrow('Duplicate field name: id');
  });

  it('rejects a missing insertion anchor instead of changing field order silently', () => {
    expect(() =>
      applySchemaPatchOperations(createState(), [
        {
          id: 'add-status',
          kind: 'field.add',
          afterFieldId: 'missing-field',
          field: {
            fieldName: 'status',
            fieldType: 'varchar(32)',
            fieldComment: '',
            nullable: false,
            defaultKind: 'none',
            defaultValue: '',
            onUpdate: 'none',
          },
        },
      ]),
    ).toThrow('Field not found: missing-field');
  });
});
