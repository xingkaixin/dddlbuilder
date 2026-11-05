import {
  AmbiguousTableOverwriteError,
  buildSavedTableBatchImportPlan,
} from '@/utils/savedTableBatchImport';
import { describe, expect, it } from 'vitest';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { SavedTableRecord } from '@/utils/workspaceStorageTypes';
import { createFieldRow, createPersistedState } from '@/__tests__/utils/testFactories';

const createState = (tableName: string): PersistedState => createPersistedState({ tableName });

const createRecord = (
  normalizedName: string,
  name: string,
  options: Partial<SavedTableRecord> = {},
): SavedTableRecord => ({
  normalizedName,
  name,
  state: createState(name),
  createdAt: 10,
  updatedAt: 20,
  ...options,
});

describe('buildSavedTableBatchImportPlan', () => {
  it('批量覆盖保留字段身份，另存副本不继承身份', () => {
    const existing = createRecord('users', 'users', {
      state: {
        ...createState('users'),
        rows: [createFieldRow('original', { fieldType: 'INT' })],
      },
    });
    const item = {
      name: 'users',
      state: { ...existing.state, rows: [{ ...existing.state.rows[0], id: 'imported' }] },
    };
    const overwritten = buildSavedTableBatchImportPlan(
      { items: [item], conflictStrategy: 'overwrite' },
      [existing],
      100,
    );
    const copied = buildSavedTableBatchImportPlan(
      { items: [item], conflictStrategy: 'rename' },
      [existing],
      100,
    );
    expect(overwritten.records[0].state.rows[0].id).toBe('original');
    expect(copied.records[0].state.rows[0].id).toBe('imported');
  });

  it('rejects ambiguous overwrite targets but allows skip and rename', () => {
    const existing = ['first', 'second'].map((tableId) =>
      createRecord('shared', 'Shared', { tableId }),
    );
    const items = [{ name: 'Shared', state: createState('imported') }];
    expect(() =>
      buildSavedTableBatchImportPlan({ items, conflictStrategy: 'overwrite' }, existing, 100),
    ).toThrow(AmbiguousTableOverwriteError);
    expect(
      buildSavedTableBatchImportPlan({ items, conflictStrategy: 'skip' }, existing, 100).records,
    ).toEqual([]);

    const renamed = buildSavedTableBatchImportPlan(
      { items, conflictStrategy: 'rename' },
      existing,
      100,
    ).records[0];
    expect(renamed.normalizedName).toBe('shared_1');
    expect(existing.map((table) => table.tableId)).not.toContain(renamed.tableId);
  });
});
