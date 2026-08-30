import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersistedState } from '@ddlbuilder/shared-types';
import {
  clearWorkspaceHistory,
  deleteIndexedDbSavedTablePermanently,
  finalizeWorkspaceEntityDeletion,
} from '@/services/workspaceHistoryCleanup';
import { addSavedTable, getSavedTable, updateSavedTable } from '@/utils/savedTablesDb';
import { createVersion, listVersions } from '@/utils/tableVersions';
import { listReviews, saveReview } from '@/utils/reviewHistory';
import {
  beginWorkspaceEntityDeletion,
  createWorkspaceEntityDeletionMarker,
} from '@/utils/workspaceEntityDeletion';
import * as workspaceDb from '@/utils/workspaceDb';
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

  it('历史事务失败时保留 deleting marker 并阻止两类迟到写入', async () => {
    const target = { scope, tableId: 'failed-history-id', normalizedName: 'failed-history' };
    await createVersion(target, createState('before'));
    await saveReview(target, 'before', 'ddl', 'mysql', {
      score: 8,
      summary: 'before',
      suggestions: [],
    });
    const operationId = await beginWorkspaceEntityDeletion(target);
    const metaRequest: Partial<IDBRequest> = {};
    const versionRequest: Partial<IDBRequest> = {};
    const reviewRequest: Partial<IDBRequest> = {};
    const transaction = {
      abort: vi.fn(),
      objectStore: vi.fn((storeName: string) => {
        if (storeName === workspaceDb.WORKSPACE_ENTITY_META_STORE_NAME) {
          return { get: () => metaRequest, put: vi.fn() };
        }
        const request =
          storeName === workspaceDb.VERSION_STORE_NAME ? versionRequest : reviewRequest;
        return { index: () => ({ getAll: () => request }), delete: vi.fn() };
      }),
      onerror: null,
      onabort: null,
      oncomplete: null,
    };
    const database = {
      transaction: vi.fn(() => transaction),
      close: vi.fn(),
    };
    const openDb = vi
      .spyOn(workspaceDb, 'openDb')
      .mockResolvedValueOnce(database as unknown as IDBDatabase);

    const finalization = finalizeWorkspaceEntityDeletion(target, operationId);
    await Promise.resolve();
    Object.assign(metaRequest, {
      result: createWorkspaceEntityDeletionMarker(target, 'deleting', operationId),
    });
    metaRequest.onsuccess?.call(metaRequest as IDBRequest, new Event('success'));
    Object.assign(reviewRequest, { error: new Error('review cleanup failed') });
    reviewRequest.onerror?.call(reviewRequest as IDBRequest, new Event('error'));

    await expect(finalization).rejects.toThrow('review cleanup failed');
    expect(database.transaction).toHaveBeenCalledWith(
      [
        workspaceDb.WORKSPACE_ENTITY_META_STORE_NAME,
        workspaceDb.VERSION_STORE_NAME,
        workspaceDb.REVIEW_STORE_NAME,
      ],
      'readwrite',
    );
    openDb.mockRestore();
    expect(await createVersion(target, createState('late'))).toBeNull();
    expect(
      await saveReview(target, 'late', 'late-ddl', 'mysql', {
        score: 8,
        summary: 'late',
        suggestions: [],
      }),
    ).toBeNull();
  });

  it('稳定 ID 删除不影响同名独立草稿评审', async () => {
    const target = { scope, tableId: 'saved-id', normalizedName: 'users' };
    const draftTarget = {
      scope,
      draftId: 'independent-users-draft',
      normalizedName: target.normalizedName,
    };
    await saveReview(draftTarget, 'users', 'before', 'mysql', {
      score: 8,
      summary: 'before',
      suggestions: [],
    });
    const operationId = await beginWorkspaceEntityDeletion(target);

    await finalizeWorkspaceEntityDeletion(target, operationId);

    expect(await listReviews(draftTarget)).toHaveLength(1);
    expect(
      await saveReview(draftTarget, 'users', 'late', 'mysql', {
        score: 8,
        summary: 'late',
        suggestions: [],
      }),
    ).not.toBeNull();
  });

  it('账号历史清理移除该 scope 的全部删除 marker', async () => {
    const target = { scope, tableId: 'deleting-id', normalizedName: 'deleting' };
    await beginWorkspaceEntityDeletion(target);

    await clearWorkspaceHistory(scope);

    expect(await createVersion(target, createState('retry'))).not.toBeNull();
  });
});
