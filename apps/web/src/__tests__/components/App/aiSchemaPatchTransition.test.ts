import { describe, expect, it } from 'vitest';
import type { FieldRow, IndexDefinition, PersistedState } from '@ddlbuilder/shared-types';
import { applyAISchemaChanges } from '@/components/App/aiSchemaPatchTransition';
import { buildAISchemaChanges } from '@/utils/aiSchemaChanges';

const row = (fieldName: string, position: number): FieldRow => ({
  id: `field-${position}`,
  fieldName,
  fieldType: 'bigint',
  fieldComment: '',
  nullable: false,
});

const createState = (rows = [row('id', 1)]): PersistedState => ({
  objectType: 'table',
  schemaName: '',
  tableName: 'users',
  tableComment: '',
  dbType: 'mysql',
  sqlFormatMode: 'compact',
  rows,
  addCount: 10,
  indexes: [],
  authInput: '',
  authObjects: [],
});

describe('applyAISchemaChanges', () => {
  it('rejects a partial rename that keeps the conflicting field', () => {
    const current = createState([
      { ...row('a', 1), id: 'a' },
      { ...row('b', 2), id: 'b' },
    ]);
    const candidate = { ...current, rows: [{ ...current.rows[0], fieldName: 'b' }] };
    const changes = buildAISchemaChanges(current, candidate);
    const selected = changes.filter((change) => change.type === 'rename');
    expect(() => applyAISchemaChanges(current, candidate, selected)).toThrow(
      'Duplicate field name: b',
    );
    expect(current.rows.map((row) => row.fieldName)).toEqual(['a', 'b']);
    expect(applyAISchemaChanges(current, candidate, changes).rows).toEqual(candidate.rows);
    expect(applyAISchemaChanges(current, candidate, [...changes].reverse()).rows).toEqual(
      candidate.rows,
    );
  });

  it.each([false, true])(
    'updates table identity and self references atomically (reverse=%s)',
    (reverse) => {
      const current = {
        ...createState([{ ...row('id', 1), id: 'primary' }]),
        foreignKeys: [
          { id: 'self', name: 'fk_self', fields: ['id'], refTable: 'users', refFields: ['id'] },
        ],
      };
      const candidate = {
        ...current,
        tableName: 'accounts',
        schemaName: 'audit',
        rows: [{ ...current.rows[0], fieldName: 'account_id' }],
      };
      const changes = buildAISchemaChanges(current, candidate);

      if (reverse) changes.reverse();
      const next = applyAISchemaChanges(current, candidate, changes);
      expect(next.foreignKeys?.[0]).toMatchObject({
        refTable: 'accounts',
        refSchema: 'audit',
        fields: ['account_id'],
        refFields: ['account_id'],
      });
      expect(current.foreignKeys[0].refTable).toBe('users');
      expect(applyAISchemaChanges(next, candidate, changes)).toEqual(next);
    },
  );

  it.each([false, true])(
    'keeps a renamed field that reuses a removed name (reverse=%s)',
    (reverse) => {
      const current = createState([
        { ...row('legacy_id', 1), id: 'kept' },
        { ...row('id', 2), id: 'removed' },
      ]);
      current.indexes = [
        {
          id: 'kept-index',
          name: 'idx_legacy_id',
          fields: [{ name: 'legacy_id', direction: 'ASC' }],
          kind: 'index',
        },
        {
          id: 'removed-index',
          name: 'idx_id',
          fields: [{ name: 'id', direction: 'ASC' }],
          kind: 'index',
        },
      ];

      const candidate = {
        ...current,
        rows: [{ ...current.rows[0], fieldName: 'id' }],
        indexes: [],
      };
      const changes = buildAISchemaChanges(current, candidate).filter(
        (change) => change.kind === 'field',
      );

      if (reverse) changes.reverse();
      const result = applyAISchemaChanges(current, candidate, changes);
      expect(result.rows).toEqual(candidate.rows);
      expect(result.indexes.map((index) => index.id)).toEqual(['kept-index']);
      expect(result.indexes[0].fields[0].name).toBe('id');
      expect(applyAISchemaChanges(result, candidate, changes)).toEqual(result);
    },
  );

  it('preserves the current field identity when an equivalent AI field has a new ID', () => {
    const current = createState([{ ...row('id', 1), id: 'old' }]);
    const candidate = createState([{ ...row('id', 1), id: 'new' }]);
    const changes = buildAISchemaChanges(current, candidate);
    const result = applyAISchemaChanges(current, candidate, changes);
    expect(changes).toEqual([]);
    expect(result.rows).toEqual(current.rows);
    expect(applyAISchemaChanges(result, candidate, changes)).toEqual(result);
  });

  it.each(['add', 'modify'] as const)('rejects a selected index %s without its field', (type) => {
    const current = createState();

    const index: IndexDefinition = {
      id: 'email-index',
      name: 'idx_email',
      kind: 'index',
      fields: [{ name: 'email', direction: 'ASC' as const }],
    };

    if (type === 'modify')
      current.indexes = [{ ...index, fields: [{ name: 'id', direction: 'ASC' }] }];

    const candidate = {
      ...current,
      tableComment: 'New comment',
      rows: [...current.rows, row('email', 2)],
      indexes: [index],
    };
    const changes = buildAISchemaChanges(current, candidate);
    const selected = changes.filter((change) => change.kind !== 'field');
    expect(() => applyAISchemaChanges(current, candidate, selected)).toThrow(
      'Unknown index field: email',
    );
    expect(current.tableComment).toBe('');
    expect(current.rows).toHaveLength(1);
    expect(applyAISchemaChanges(current, candidate, changes).indexes).toEqual([index]);
    expect(applyAISchemaChanges(current, candidate, [...changes].reverse()).indexes).toEqual([
      index,
    ]);
  });

  it('replaces an auto-renamed index independently of change order', () => {
    const oldRow = { ...row('old_name', 1), id: 'f1' };
    const newRow = { ...oldRow, fieldName: 'new_name' };

    const oldIndex: IndexDefinition = {
      id: 'i1',
      name: 'idx_old_name',
      kind: 'index' as const,
      fields: [{ name: 'old_name', direction: 'ASC' as const }],
    };
    const newIndex: IndexDefinition = {
      id: 'i2',
      name: 'idx_new_name',
      kind: 'index' as const,
      fields: [{ name: 'new_name', direction: 'ASC' as const }],
    };
    const current = { ...createState([oldRow]), indexes: [oldIndex] };
    const candidate = { ...current, rows: [newRow], indexes: [newIndex] };

    const next = applyAISchemaChanges(current, candidate, [
      {
        id: 'field:rename:old_name:new_name',
        kind: 'field',
        type: 'rename',
        fieldName: 'new_name',
        oldFieldName: 'old_name',
        oldRow,
        newRow,
      },
      {
        id: 'index:add:idx_new_name',
        kind: 'index',
        type: 'add',
        indexName: newIndex.name,
        newIndex,
      },
      {
        id: 'index:remove:idx_old_name',
        kind: 'index',
        type: 'remove',
        indexName: oldIndex.name,
        oldIndex,
      },
    ]);

    expect(next.indexes).toEqual([newIndex]);
  });

  it.each([false, true])('cleans field references when applying removals (all=%s)', (all) => {
    const current: PersistedState = {
      ...createState([row('id', 1), row('user_id', 2)]),
      indexes: [
        {
          id: 'idx-user',
          name: 'idx_user',
          kind: 'index',
          fields: [{ name: 'user_id', direction: 'ASC' }],
        },
      ],
      foreignKeys: [
        {
          id: 'fk-user',
          name: 'fk_user',
          fields: ['user_id'],
          refTable: 'users',
          refFields: ['id'],
        },
      ],
      mysqlPartitionConfig: { enabled: true, type: 'HASH', columns: ['user_id'], partitions: [] },
    };
    const candidate = { ...current, rows: [current.rows[0]], indexes: [], foreignKeys: [] };
    const changes = buildAISchemaChanges(current, candidate);

    const next = applyAISchemaChanges(
      current,
      candidate,
      all ? changes : changes.filter((change) => change.kind === 'field'),
    );

    expect(next.rows).toEqual([current.rows[0]]);
    expect(next.indexes).toEqual([]);
    expect(next.foreignKeys).toEqual([]);
    expect(next.mysqlPartitionConfig).toMatchObject({ enabled: false, columns: [] });
  });
});
