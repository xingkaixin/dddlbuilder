import { beforeEach, describe, expect, it } from 'vitest';
import type { PersistedState } from '@ddlbuilder/shared-types';
import {
  clearEditorHistory,
  recordEditorHistory,
  redoEditorHistory,
  runWithEditorHistoryGuard,
  seedEditorHistory,
  undoEditorHistory,
} from '@/stores/editorHistory';

const makeState = (tableName: string): PersistedState => ({
  schemaName: '',
  tableName,
  tableComment: '',
  dbType: 'mysql',
  sqlFormatMode: 'compact',
  rows: [],
  addCount: 1,
  indexes: [],
  authInput: '',
  authObjects: [],
});

describe('editorHistory', () => {
  beforeEach(() => {
    clearEditorHistory();
  });

  it('records snapshots, undoes, and redoes independently per document', () => {
    const initial = makeState('users');
    const renamed = makeState('accounts');
    const commented = { ...renamed, tableComment: 'Accounts table' };

    seedEditorHistory('tab-1', initial);
    recordEditorHistory('tab-1', renamed, 1000);
    recordEditorHistory('tab-1', commented, 2000);

    expect(undoEditorHistory('tab-1')?.tableName).toBe('accounts');
    expect(undoEditorHistory('tab-1')?.tableName).toBe('users');
    expect(undoEditorHistory('tab-1')).toBeNull();

    expect(redoEditorHistory('tab-1')?.tableName).toBe('accounts');
    expect(redoEditorHistory('tab-1')?.tableComment).toBe('Accounts table');
    expect(redoEditorHistory('tab-1')).toBeNull();
  });

  it('ignores snapshots recorded while applying undo/redo', () => {
    seedEditorHistory('tab-2', makeState('orders'));
    runWithEditorHistoryGuard(() => {
      recordEditorHistory('tab-2', makeState('ignored'), 1000);
    });
    expect(undoEditorHistory('tab-2')).toBeNull();
  });
});
