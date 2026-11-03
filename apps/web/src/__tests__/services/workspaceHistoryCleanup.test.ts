import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PersistedState } from '@ddlbuilder/shared-types';
import {
  clearWorkspaceHistory,
  deleteIndexedDbSavedTablePermanently,
  finalizeWorkspaceEntityDeletion,
} from '@/services/workspaceHistoryCleanup';
import { addSavedTable, getSavedTable, updateSavedTable } from '@/utils/savedTablesDb';
import { createVersion, listVersions } from '@/utils/tableVersions';
import { listReviews, saveReview } from '@/utils/reviewHistory';
import { beginWorkspaceEntityDeletion } from '@/utils/workspaceEntityDeletion';
import type { SavedTableRecord } from '@/utils/workspaceStorageTypes';
import { setupFakeIndexedDB, teardownFakeIndexedDB } from '@/__tests__/utils/fakeIndexedDb';

const scope = { kind: 'anonymous' as const };

const createState = (tableName: string): PersistedState => ({
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

const createRecord = (tableId: string, normalizedName: string): SavedTableRecord => ({
  tableId,
  normalizedName,
  name: normalizedName,
  state: createState(normalizedName),
  createdAt: 1,
  updatedAt: 1,
});

describe('workspaceHistoryCleanup', () => {
  beforeEach(() => {
    setupFakeIndexedDB();
  });

  afterEach(() => {
    teardownFakeIndexedDB();
  });

  it('匿名永久删除按稳定 ID 保留同名的新表', async () => {
    const oldTarget = { scope, tableId: 'old-id', normalizedName: 'shared' };
    await addSavedTable(createRecord('new-id', 'shared'), scope);
    await createVersion(oldTarget, createState('old'));
    await saveReview(oldTarget, 'old', 'ddl', 'mysql', {
      score: 8,
      summary: 'old',
      suggestions: [],
    });

    await deleteIndexedDbSavedTablePermanently(oldTarget);

    expect((await getSavedTable('shared', scope))?.tableId).toBe('new-id');
    expect(await listVersions(oldTarget)).toEqual([]);
    expect(await listReviews(oldTarget)).toEqual([]);
    expect(await createVersion(oldTarget, createState('late'))).toBeNull();
  });

  it('普通更新不能清 deleted marker，显式恢复可在主写事务内清除', async () => {
    const target = { scope, tableId: 'restore-id', normalizedName: 'restore' };
    const record = createRecord(target.tableId, target.normalizedName);
    await addSavedTable(record, scope);
    const operationId = await beginWorkspaceEntityDeletion(target);
    await finalizeWorkspaceEntityDeletion(target, operationId);

    await expect(updateSavedTable({ ...record, updatedAt: 2 }, scope)).rejects.toThrow(
      '表正在永久删除',
    );

    await updateSavedTable({ ...record, updatedAt: 3 }, scope, 'activate');

    expect((await getSavedTable(target, scope))?.updatedAt).toBe(3);
    expect(await createVersion(target, createState('restored'))).not.toBeNull();
  });

  it('账号历史清理移除该 scope 的全部删除 marker', async () => {
    const target = { scope, tableId: 'deleting-id', normalizedName: 'deleting' };
    await beginWorkspaceEntityDeletion(target);

    await clearWorkspaceHistory(scope);

    expect(await createVersion(target, createState('retry'))).not.toBeNull();
  });
});
