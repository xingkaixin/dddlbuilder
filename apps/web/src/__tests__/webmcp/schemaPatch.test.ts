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

  it('parses every supported operation and normalizes optional values', () => {
    const operations = parseSchemaPatchOperations([
      {
        id: 'table',
        kind: 'table.update',
        schemaName: ' inventory ',
        tableName: ' purchases ',
        tableComment: ' Purchase records ',
      },
      {
        id: 'add-field',
        kind: 'field.add',
        afterFieldId: 'field-id',
        field: {
          fieldName: ' status ',
          fieldType: ' varchar(32) ',
          fieldComment: ' State ',
          nullable: false,
          defaultKind: 'constant',
          defaultValue: ' pending ',
          onUpdate: 'current_timestamp',
        },
      },
      {
        id: 'update-field',
        kind: 'field.update',
        fieldId: 'field-user',
        changes: { fieldComment: ' Owner ', nullable: true },
      },
      { id: 'remove-field', kind: 'field.remove', fieldId: 'field-user' },
      {
        id: 'reorder-field',
        kind: 'field.reorder',
        fieldId: 'field-user',
        afterFieldId: 'field-id',
      },
      { id: 'move-first', kind: 'field.reorder', fieldId: 'field-id' },
      {
        id: 'add-index',
        kind: 'index.add',
        index: {
          name: ' idx_status ',
          fields: [{ name: ' status ' }, { name: 'user_id', direction: 'DESC' }],
          unique: true,
          isPrimary: true,
        },
      },
      {
        id: 'update-index',
        kind: 'index.update',
        indexId: 'index-user',
        changes: {
          name: ' idx_owner ',
          fields: [{ name: 'user_id', direction: 'ASC' }],
          unique: false,
          isPrimary: false,
        },
      },
      { id: 'remove-index', kind: 'index.remove', indexId: 'index-user' },
    ]);

    expect(operations).toMatchObject([
      {
        id: 'table',
        kind: 'table.update',
        schemaName: 'inventory',
        tableName: 'purchases',
        tableComment: 'Purchase records',
      },
      {
        id: 'add-field',
        kind: 'field.add',
        afterFieldId: 'field-id',
        field: {
          fieldName: 'status',
          fieldType: 'varchar(32)',
          fieldComment: 'State',
          nullable: false,
          defaultKind: 'constant',
          defaultValue: 'pending',
          onUpdate: 'current_timestamp',
        },
      },
      {
        id: 'update-field',
        kind: 'field.update',
        fieldId: 'field-user',
        changes: { fieldComment: 'Owner', nullable: true },
      },
      { id: 'remove-field', kind: 'field.remove', fieldId: 'field-user' },
      {
        id: 'reorder-field',
        kind: 'field.reorder',
        fieldId: 'field-user',
        afterFieldId: 'field-id',
      },
      { id: 'move-first', kind: 'field.reorder', fieldId: 'field-id' },
      {
        id: 'add-index',
        kind: 'index.add',
        index: {
          name: 'idx_status',
          fields: [
            { name: 'status', direction: 'ASC' },
            { name: 'user_id', direction: 'DESC' },
          ],
          unique: true,
          isPrimary: true,
        },
      },
      {
        id: 'update-index',
        kind: 'index.update',
        indexId: 'index-user',
        changes: {
          name: 'idx_owner',
          fields: [{ name: 'user_id', direction: 'ASC' }],
          unique: false,
          isPrimary: false,
        },
      },
      { id: 'remove-index', kind: 'index.remove', indexId: 'index-user' },
    ]);
  });

  it.each([
    [undefined, 'Operations are required'],
    [[], 'Operations are required'],
    [[null], 'Invalid operation at index 0'],
    [[{}], 'Invalid kind'],
    [[{ kind: 'unknown' }], 'Unsupported operation kind: unknown'],
    [
      [
        { id: 'same', kind: 'field.remove', fieldId: 'field-id' },
        { id: 'same', kind: 'field.remove', fieldId: 'field-user' },
      ],
      'Duplicate operation id: same',
    ],
    [[{ kind: 'field.add', field: null }], 'Invalid field'],
    [[{ kind: 'field.add', field: { fieldName: '', fieldType: 'bigint' } }], 'Invalid fieldName'],
    [
      [{ kind: 'field.add', field: { fieldName: 'id', fieldType: 'bigint', fieldComment: 1 } }],
      'Invalid fieldComment',
    ],
    [[{ kind: 'index.add', index: null }], 'Invalid index'],
    [[{ kind: 'index.add', index: { name: 'idx', fields: [] } }], 'Invalid index fields'],
    [[{ kind: 'index.add', index: { name: 'idx', fields: [null] } }], 'Invalid index field'],
    [
      [{ kind: 'index.add', index: { name: 'idx', fields: [{ name: 'id', direction: 'SIDE' }] } }],
      'Invalid index direction',
    ],
    [
      [{ kind: 'index.add', index: { name: 'idx', fields: [{ name: 'id' }], unique: 'yes' } }],
      'Invalid unique',
    ],
  ])('rejects malformed operation input %#', (input, message) => {
    expect(() => parseSchemaPatchOperations(input)).toThrow(message);
  });

  it('applies table, field ordering, and index operations in sequence', () => {
    const base = createState();
    base.rows.push({
      id: 'field-empty',
      fieldName: '',
      fieldType: '',
      fieldComment: '',
      nullable: true,
      defaultKind: 'none',
      defaultValue: '',
      onUpdate: 'none',
    });

    const next = applySchemaPatchOperations(base, [
      {
        id: 'table',
        kind: 'table.update',
        tableName: 'purchases',
        tableComment: 'Purchases',
      },
      {
        id: 'add-field',
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
      {
        id: 'update-field',
        kind: 'field.update',
        fieldId: 'field-id',
        changes: { fieldComment: 'Primary key' },
      },
      {
        id: 'reorder-field',
        kind: 'field.reorder',
        fieldId: 'field-user',
      },
      {
        id: 'add-index',
        kind: 'index.add',
        index: {
          name: 'idx_orders_status',
          fields: [{ name: 'status', direction: 'ASC' }],
          unique: false,
        },
      },
      {
        id: 'update-index',
        kind: 'index.update',
        indexId: 'index-user',
        changes: { name: 'idx_orders_owner', unique: true },
      },
      { id: 'remove-index', kind: 'index.remove', indexId: 'index-user' },
    ]);

    expect(next.tableName).toBe('purchases');
    expect(next.schemaName).toBe('public');
    expect(next.tableComment).toBe('Purchases');
    expect(next.rows.map((row) => row.fieldName)).toEqual(['user_id', 'id', 'status', '']);
    expect(next.rows[1].fieldComment).toBe('Primary key');
    expect(next.indexes).toEqual([
      expect.objectContaining({
        name: 'idx_orders_status',
        fields: [{ name: 'status', direction: 'ASC' }],
      }),
    ]);
  });

  it('renames a field when optional document features are absent', () => {
    const base = createState();
    base.foreignKeys = undefined;
    base.mysqlPartitionConfig = undefined;
    base.citusShardingConfig = undefined;
    base.tableMiscConfig = undefined;

    const next = applySchemaPatchOperations(base, [
      {
        id: 'rename-user',
        kind: 'field.update',
        fieldId: 'field-user',
        changes: { fieldName: 'owner_id' },
      },
    ]);

    expect(next.rows[1].fieldName).toBe('owner_id');
    expect(next.foreignKeys).toBeUndefined();
    expect(next.mysqlPartitionConfig).toBeUndefined();
    expect(next.citusShardingConfig).toBeUndefined();
    expect(next.tableMiscConfig).toBeUndefined();
  });

  it.each([
    [
      { id: 'update', kind: 'field.update', fieldId: 'missing', changes: {} },
      'Field not found: missing',
    ],
    [{ id: 'remove', kind: 'field.remove', fieldId: 'missing' }, 'Field not found: missing'],
    [{ id: 'reorder', kind: 'field.reorder', fieldId: 'missing' }, 'Field not found: missing'],
    [
      {
        id: 'reorder',
        kind: 'field.reorder',
        fieldId: 'field-user',
        afterFieldId: 'missing',
      },
      'Field not found: missing',
    ],
    [
      {
        id: 'duplicate-index',
        kind: 'index.add',
        index: {
          name: 'IDX_ORDERS_USER_ID',
          fields: [{ name: 'user_id', direction: 'ASC' }],
          unique: false,
        },
      },
      'Duplicate index name: IDX_ORDERS_USER_ID',
    ],
    [
      { id: 'update-index', kind: 'index.update', indexId: 'missing', changes: {} },
      'Index not found: missing',
    ],
    [{ id: 'remove-index', kind: 'index.remove', indexId: 'missing' }, 'Index not found: missing'],
    [
      {
        id: 'unknown-index-field',
        kind: 'index.add',
        index: {
          name: 'idx_missing',
          fields: [{ name: 'missing', direction: 'ASC' }],
          unique: false,
        },
      },
      'Unknown index field: missing',
    ],
  ] satisfies Array<[Parameters<typeof applySchemaPatchOperations>[1][number], string]>)(
    'rejects invalid document operations %#',
    (operation, message) => {
      expect(() => applySchemaPatchOperations(createState(), [operation])).toThrow(message);
    },
  );

  it('rejects renaming an index to another existing index name', () => {
    const base = createState();
    base.indexes.push({
      id: 'index-status',
      name: 'idx_orders_status',
      fields: [{ name: 'id', direction: 'ASC' }],
      unique: false,
    });

    expect(() =>
      applySchemaPatchOperations(base, [
        {
          id: 'rename-index',
          kind: 'index.update',
          indexId: 'index-user',
          changes: { name: 'IDX_ORDERS_STATUS' },
        },
      ]),
    ).toThrow('Duplicate index name: IDX_ORDERS_STATUS');
  });
});
