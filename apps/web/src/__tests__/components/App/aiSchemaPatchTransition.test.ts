import { describe, expect, it } from 'vitest';
import type { FieldRow, PersistedState } from '@ddlbuilder/shared-types';
import {
  applyAISchemaChanges,
  applyFieldSchemaChange,
} from '@/components/App/aiSchemaPatchTransition';

const row = (fieldName: string, order: number): FieldRow => ({
  order,
  fieldName,
  fieldType: 'bigint',
  fieldComment: '',
  nullable: false,
});

describe('applyFieldSchemaChange', () => {
  it('inserts a field at its candidate position and repairs order', () => {
    const email = row('email', 2);
    const result = applyFieldSchemaChange([row('id', 1)], [row('id', 1), email], {
      id: 'field:add:email',
      kind: 'field',
      type: 'add',
      fieldName: 'email',
      newRow: email,
    });

    expect(result.rows.map(({ fieldName, order }) => ({ fieldName, order }))).toEqual([
      { fieldName: 'id', order: 1 },
      { fieldName: 'email', order: 2 },
    ]);
    expect(result.focusIndex).toBe(1);
  });

  it('renames a field case-insensitively', () => {
    const renamed = row('account_id', 1);
    const result = applyFieldSchemaChange([row('User_ID', 1)], [renamed], {
      id: 'field:rename:user_id:account_id',
      kind: 'field',
      type: 'rename',
      fieldName: 'account_id',
      oldFieldName: 'user_id',
      newRow: renamed,
    });

    expect(result.rows[0]?.fieldName).toBe('account_id');
    expect(result.focusIndex).toBe(0);
  });

  it('removes a field and reports its former position', () => {
    const result = applyFieldSchemaChange([row('id', 1), row('email', 2)], [], {
      id: 'field:remove:email',
      kind: 'field',
      type: 'remove',
      fieldName: 'email',
    });

    expect(result.rows).toEqual([row('id', 1)]);
    expect(result.focusIndex).toBe(1);
  });

  it('leaves unsupported incomplete changes unchanged', () => {
    const rows = [row('id', 1)];
    const result = applyFieldSchemaChange(rows, rows, {
      id: 'field:add:email',
      kind: 'field',
      type: 'add',
      fieldName: 'email',
    });

    expect(result).toEqual({ rows, focusIndex: -1 });
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
    const first = applyFieldSchemaChange([row('id', 1)], candidateRows, change);
    const second = applyFieldSchemaChange(first.rows, candidateRows, change);

    expect(second.rows.map((item) => item.fieldName)).toEqual(['id', 'email']);
  });
});

describe('applyAISchemaChanges', () => {
  const createState = (): PersistedState => ({
    objectType: 'table',
    schemaName: '',
    tableName: 'users',
    tableComment: '',
    dbType: 'mysql',
    sqlFormatMode: 'compact',
    rows: [row('id', 1)],
    addCount: 10,
    indexInput: '',
    currentIndexFields: [],
    indexes: [],
    authInput: '',
    authObjects: [],
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
