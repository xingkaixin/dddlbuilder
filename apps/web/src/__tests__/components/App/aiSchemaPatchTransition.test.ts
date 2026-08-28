import { describe, expect, it } from 'vitest';
import type { FieldRow, PersistedState } from '@ddlbuilder/shared-types';
import { applyAISchemaChanges } from '@/components/App/aiSchemaPatchTransition';
import { buildAISchemaChanges } from '@/utils/aiSchemaChanges';

const row = (fieldName: string, order: number): FieldRow => ({
  order,
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
  indexInput: '',
  currentIndexFields: [],
  indexes: [],
  authInput: '',
  authObjects: [],
});

describe('AI field changes', () => {
  it('inserts a field at its candidate position', () => {
    const email = row('email', 2);
    const result = applyAISchemaChanges(createState(), createState([row('id', 1), email]), [
      {
        id: 'field:add:email',
        kind: 'field',
        type: 'add',
        fieldName: 'email',
        newRow: email,
      },
    ]);

    expect(result.rows.map(({ fieldName, order }) => ({ fieldName, order }))).toEqual([
      { fieldName: 'id', order: 1 },
      { fieldName: 'email', order: 2 },
    ]);
  });

  it('renames a field case-insensitively', () => {
    const renamed = row('account_id', 1);
    const result = applyAISchemaChanges(createState([row('User_ID', 1)]), createState([renamed]), [
      {
        id: 'field:rename:user_id:account_id',
        kind: 'field',
        type: 'rename',
        fieldName: 'account_id',
        oldFieldName: 'user_id',
        newRow: renamed,
      },
    ]);

    expect(result.rows[0]?.fieldName).toBe('account_id');
  });

  it('removes a field', () => {
    const result = applyAISchemaChanges(
      createState([row('id', 1), row('email', 2)]),
      createState(),
      [
        {
          id: 'field:remove:email',
          kind: 'field',
          type: 'remove',
          fieldName: 'email',
        },
      ],
    );

    expect(result.rows).toEqual([row('id', 1)]);
  });

  it('leaves unsupported incomplete changes unchanged', () => {
    const rows = [row('id', 1)];
    const result = applyAISchemaChanges(createState(rows), createState(rows), [
      {
        id: 'field:add:email',
        kind: 'field',
        type: 'add',
        fieldName: 'email',
      },
    ]);

    expect(result).toEqual(createState(rows));
  });

  it('does not add the same field twice', () => {
    const email = row('email', 2);
    const change = {
      id: 'field:add:email',
      kind: 'field' as const,
      type: 'add' as const,
      fieldName: 'email',
      newRow: email,
    };
    const candidateRows = [row('id', 1), email];
    const first = applyAISchemaChanges(createState(), createState(candidateRows), [change]);
    const second = applyAISchemaChanges(first, createState(candidateRows), [change]);

    expect(second.rows.map((item) => item.fieldName)).toEqual(['id', 'email']);
  });
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
          unique: false,
        },
        {
          id: 'removed-index',
          name: 'idx_id',
          fields: [{ name: 'id', direction: 'ASC' }],
          unique: false,
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

  it.each([false, true])('adds a field with a name vacated by a rename (reverse=%s)', (reverse) => {
    const current = createState([{ ...row('id', 1), id: 'original' }]);
    const candidate = createState([
      { ...row('id', 1), id: 'new' },
      { ...current.rows[0], fieldName: 'legacy_id', order: 2 },
    ]);
    const changes = buildAISchemaChanges(current, candidate);
    if (reverse) changes.reverse();
    const result = applyAISchemaChanges(current, candidate, changes);
    expect(result.rows).toEqual(candidate.rows);
    expect(applyAISchemaChanges(result, candidate, changes)).toEqual(result);
  });

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
    const index = {
      id: 'email-index',
      name: 'idx_email',
      unique: false,
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

  it.each([false, true])(
    'preserves a modified index after field removal (reverse=%s)',
    (reverse) => {
      const current: PersistedState = {
        ...createState([row('old_key', 1), row('new_key', 2)]),
        indexes: [
          {
            id: 'uk-keys',
            name: 'uk_keys',
            unique: true,
            fields: [
              { name: 'old_key', direction: 'ASC' },
              { name: 'new_key', direction: 'ASC' },
            ],
          },
        ],
      };
      const candidate = {
        ...current,
        rows: [current.rows[1]],
        indexes: [{ ...current.indexes[0], fields: [current.indexes[0].fields[1]] }],
      };
      const changes = buildAISchemaChanges(current, candidate);
      if (reverse) changes.reverse();
      const next = applyAISchemaChanges(current, candidate, changes);

      expect(next.rows).toEqual(candidate.rows);
      expect(next.indexes).toEqual(candidate.indexes);
      expect(applyAISchemaChanges(next, candidate, changes)).toEqual(next);
    },
  );

  it.each([false, true])('cleans field references when applying removals (all=%s)', (all) => {
    const current: PersistedState = {
      ...createState([row('id', 1), row('user_id', 2)]),
      indexes: [
        {
          id: 'idx-user',
          name: 'idx_user',
          unique: false,
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

  it('applies a selected batch as one state transition and stays idempotent', () => {
    const current = createState();
    const email = row('email', 2);
    const index = {
      id: 'idx-email',
      name: 'idx_users_email',
      fields: [{ name: 'email', direction: 'ASC' as const }],
      unique: false,
    };
    const candidate = {
      ...current,
      tableComment: 'Accounts',
      rows: [...current.rows, email],
      indexes: [index],
    };
    const changes = [
      {
        id: 'table:table_comment',
        kind: 'table' as const,
        type: 'table_comment' as const,
        oldValue: '',
        newValue: 'Accounts',
      },
      {
        id: 'field:add:email',
        kind: 'field' as const,
        type: 'add' as const,
        fieldName: 'email',
        newRow: email,
      },
      {
        id: 'index:add:idx_users_email',
        kind: 'index' as const,
        type: 'add' as const,
        indexName: index.name,
        newIndex: index,
      },
    ];

    const first = applyAISchemaChanges(current, candidate, changes);
    const second = applyAISchemaChanges(first, candidate, changes);

    expect(first).toMatchObject({
      tableComment: 'Accounts',
      rows: [{ fieldName: 'id' }, { fieldName: 'email' }],
      indexes: [{ name: 'idx_users_email' }],
    });
    expect(second).toEqual(first);
  });
});
