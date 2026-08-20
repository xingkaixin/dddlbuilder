import { describe, expect, it } from 'vitest';
import type { FieldRow } from '@ddlbuilder/shared-types';
import { applyFieldSchemaChange } from '@/components/App/aiSchemaPatchTransition';

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
});
