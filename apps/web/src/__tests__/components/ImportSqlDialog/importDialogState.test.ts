import { describe, expect, it } from 'vitest';
import {
  createImportDialogState,
  importDialogReducer,
} from '@/components/ImportSqlDialog/importDialogState';

describe('importDialogReducer', () => {
  it('keeps workspace and saved-table steps mutually exclusive', () => {
    const workspace = createImportDialogState('mysql');
    const saved = importDialogReducer(workspace, { type: 'set_mode', mode: 'saved' });
    const selected = importDialogReducer(saved, {
      type: 'saved_validated',
      tables: [],
      failedItems: [],
    });
    const save = importDialogReducer(selected, { type: 'advance' });

    expect(saved).toMatchObject({ mode: 'saved', step: 'validate' });
    expect(selected).toMatchObject({ mode: 'saved', step: 'select' });
    expect(save).toMatchObject({ mode: 'saved', step: 'save' });
    expect(importDialogReducer(save, { type: 'back' })).toMatchObject({
      mode: 'saved',
      step: 'select',
    });
  });

  it('ignores workflow-specific actions from the inactive mode', () => {
    const saved = importDialogReducer(createImportDialogState('mysql'), {
      type: 'set_mode',
      mode: 'saved',
    });

    const result = importDialogReducer(saved, {
      type: 'workspace_validated',
      result: {
        tableName: 'users',
        tableComment: '',
        fields: [],
        indexes: [],
        authObjects: [],
      },
      fields: [],
    });

    expect(result).toBe(saved);
  });

  it('resets the entire workflow using the latest database type', () => {
    const edited = importDialogReducer(createImportDialogState('mysql'), {
      type: 'set_sql',
      sql: 'CREATE TABLE users (id INT)',
    });
    const reset = importDialogReducer(edited, { type: 'reset', dbType: 'postgresql' });

    expect(reset).toMatchObject({
      mode: 'workspace',
      step: 'validate',
      sourceType: 'sql',
      sql: '',
      selectedDbType: 'postgresql',
      operation: 'idle',
    });
  });
});
