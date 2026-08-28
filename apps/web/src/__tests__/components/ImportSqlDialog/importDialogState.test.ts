import { describe, expect, it } from 'vitest';
import {
  createImportDialogState,
  importDialogReducer,
} from '@/components/ImportSqlDialog/importDialogState';
import type { ParsedTableItem } from '@/components/ImportSqlDialog/types';

const parsedResult = {
  tableName: 'users',
  tableComment: '',
  fields: [],
  indexes: [],
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

const parsedTables: ParsedTableItem[] = [
  { ...parsedResult, selected: true, conflict: false },
  { ...parsedResult, tableName: 'posts', selected: false, conflict: true },
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
      result: parsedResult,
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
      operation: { kind: 'idle' },
    });
  });

  it('handles workspace validation, preview editing, and navigation', () => {
    const initial = createImportDialogState('mysql');
    const withSource = importDialogReducer(initial, { type: 'set_source_type', sourceType: 'csv' });
    const file = new File(['id,name'], 'users.csv', { type: 'text/csv' });
    const withFile = importDialogReducer(withSource, { type: 'set_file', file });
    const withDatabase = importDialogReducer(withFile, {
      type: 'set_db_type',
      dbType: 'postgresql',
    });
    const validating = importDialogReducer(withDatabase, { type: 'validation_started' });
    const failed = importDialogReducer(validating, {
      type: 'validation_failed',
      result: { success: false, error: 'Invalid SQL' },
    });
    const preview = importDialogReducer(failed, {
      type: 'workspace_validated',
      result: { ...parsedResult, fields: previewFields },
    });
    const renamed = importDialogReducer(preview, {
      type: 'update_preview_field',
      index: 0,
      field: 'name',
      value: 'user_id',
    });
    const movedDown = importDialogReducer(renamed, {
      type: 'move_preview_field',
      index: 0,
      direction: 'down',
    });
    const movedUp = importDialogReducer(movedDown, {
      type: 'move_preview_field',
      index: 1,
      direction: 'up',
    });
    const deleted = importDialogReducer(movedUp, { type: 'delete_preview_field', index: 1 });
    const confirmed = importDialogReducer(deleted, { type: 'advance' });

    expect(withSource).toMatchObject({ sourceType: 'csv', file: null, validationResult: null });
    expect(withFile.file).toBe(file);
    expect(withDatabase.selectedDbType).toBe('postgresql');
    expect(validating).toMatchObject({ operation: { kind: 'validating' }, validationResult: null });
    expect(failed).toMatchObject({
      operation: { kind: 'idle' },
      validationResult: { success: false },
    });
    expect(renamed.mode === 'workspace' && renamed.parsedResult?.fields[0]?.name).toBe('user_id');
    expect(movedDown.mode === 'workspace' && movedDown.parsedResult?.fields[0]?.name).toBe('name');
    expect(movedUp.mode === 'workspace' && movedUp.parsedResult?.fields[0]?.name).toBe('user_id');
    expect(deleted.mode === 'workspace' && deleted.parsedResult?.fields).toHaveLength(1);
    expect(confirmed).toMatchObject({ mode: 'workspace', step: 'confirm' });
    expect(importDialogReducer(confirmed, { type: 'back' })).toMatchObject({ step: 'preview' });
    expect(importDialogReducer(preview, { type: 'back' })).toMatchObject({ step: 'validate' });
  });

  it('handles saved-table selection and import options', () => {
    const workspace = createImportDialogState('mysql');
    const saved = importDialogReducer(workspace, { type: 'set_mode', mode: 'saved' });
    const selected = importDialogReducer(saved, {
      type: 'saved_validated',
      tables: parsedTables,
      failedItems: [{ statement: 'broken', error: 'Invalid SQL' }],
    });
    const toggled = importDialogReducer(selected, { type: 'toggle_table', index: 1 });
    const cleared = importDialogReducer(toggled, {
      type: 'select_all_tables',
      selected: false,
    });
    const withFolder = importDialogReducer(cleared, { type: 'set_folder', folderId: 'folder-1' });
    const overwritten = importDialogReducer(withFolder, {
      type: 'set_conflict_strategy',
      strategy: 'overwrite',
    });
    const importing = importDialogReducer(overwritten, { type: 'import_started' });
    const finished = importDialogReducer(importing, { type: 'import_finished' });
    const workspaceAgain = importDialogReducer(finished, { type: 'set_mode', mode: 'workspace' });

    expect(toggled.mode === 'saved' && toggled.parsedTables[1]?.selected).toBe(true);
    expect(cleared.mode === 'saved' && cleared.parsedTables.every((table) => !table.selected)).toBe(
      true,
    );
    expect(overwritten).toMatchObject({
      selectedFolderId: 'folder-1',
      conflictStrategy: 'overwrite',
    });
    expect(importing.operation.kind).toBe('importing');
    expect(finished.operation.kind).toBe('idle');
    expect(workspaceAgain).toMatchObject({ mode: 'workspace', step: 'validate' });
    expect(
      importDialogReducer(workspace, {
        type: 'saved_validated',
        tables: parsedTables,
        failedItems: [],
      }),
    ).toBe(workspace);
  });

  it('ignores invalid edits and navigation at workflow boundaries', () => {
    const workspace = createImportDialogState('mysql');
    const preview = importDialogReducer(workspace, {
      type: 'workspace_validated',
      result: { ...parsedResult, fields: previewFields },
    });
    const saved = importDialogReducer(workspace, { type: 'set_mode', mode: 'saved' });

    expect(importDialogReducer(workspace, { type: 'advance' })).toBe(workspace);
    expect(importDialogReducer(workspace, { type: 'back' })).toBe(workspace);
    expect(
      importDialogReducer(preview, {
        type: 'update_preview_field',
        index: 9,
        field: 'name',
        value: 'missing',
      }),
    ).toBe(preview);
    expect(
      importDialogReducer(preview, {
        type: 'move_preview_field',
        index: 0,
        direction: 'up',
      }),
    ).toBe(preview);
    expect(
      importDialogReducer(preview, {
        type: 'move_preview_field',
        index: 1,
        direction: 'down',
      }),
    ).toBe(preview);
    expect(
      importDialogReducer(saved, {
        type: 'update_preview_field',
        index: 0,
        field: 'name',
        value: 'ignored',
      }),
    ).toBe(saved);
    expect(importDialogReducer(saved, { type: 'toggle_table', index: 0 })).toBe(saved);
    expect(importDialogReducer(workspace, { type: 'select_all_tables', selected: true })).toBe(
      workspace,
    );
    expect(importDialogReducer(workspace, { type: 'set_folder', folderId: 'folder-1' })).toBe(
      workspace,
    );
    expect(
      importDialogReducer(workspace, {
        type: 'set_conflict_strategy',
        strategy: 'overwrite',
      }),
    ).toBe(workspace);
  });
});
