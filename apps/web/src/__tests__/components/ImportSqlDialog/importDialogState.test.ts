import { describe, expect, it } from 'vitest';
import {
  createImportDialogState,
  importDialogReducer,
} from '@/components/ImportSqlDialog/importDialogState';

const parsedResult = {
  tableName: 'users',
  tableComment: '',
  fields: [],
  indexes: [],
  foreignKeys: [],
  authObjects: [],
};

const previewFields = [
  {
    name: 'id',
    type: 'INT',
    comment: '',
    nullable: false,
    defaultKind: 'none' as const,
    defaultValue: '',
    onUpdate: 'none' as const,
  },
  {
    name: 'name',
    type: 'VARCHAR',
    comment: '',
    nullable: true,
    defaultKind: 'none' as const,
    defaultValue: '',
    onUpdate: 'none' as const,
  },
];

describe('importDialogReducer', () => {
  it('keeps indexes aligned with renamed and deleted preview fields', () => {
    const preview = importDialogReducer(createImportDialogState('mysql'), {
      type: 'workspace_validated',
      result: {
        ...parsedResult,
        fields: previewFields,
        indexes: [
          {
            id: 'index',
            name: 'idx_id',
            fields: [{ name: 'id', direction: 'ASC' }],
            kind: 'index',
          },
        ],
      },
    });
    const renamed = importDialogReducer(preview, {
      type: 'update_preview_field',
      index: 0,
      field: 'name',
      value: 'user_id',
    });
    expect(renamed.mode === 'workspace' && renamed.parsedResult?.indexes[0].fields[0].name).toBe(
      'user_id',
    );
    const removed = importDialogReducer(renamed, { type: 'delete_preview_field', index: 0 });
    expect(removed.mode === 'workspace' && removed.parsedResult?.indexes).toEqual([]);
  });
});
