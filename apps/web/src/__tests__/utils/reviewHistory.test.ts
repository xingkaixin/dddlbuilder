import { describe, it, expect, vi } from 'vitest';
import {
  saveReview,
  listReviews,
  listReviewMetadata,
  getReview,
  deleteReview,
  migrateReviewsToTable,
  pruneOldReviews,
} from '@/utils/reviewHistory';
import * as dbUtils from '@/utils/workspaceDb';
import { runIndexedDbTransaction } from '@/utils/indexedDbTransaction';
import {
  beginWorkspaceEntityDeletion,
  cancelWorkspaceEntityDeletion,
} from '@/utils/workspaceEntityDeletion';
import {
  clearWorkspaceHistory,
  finalizeWorkspaceEntityDeletion,
} from '@/services/workspaceHistoryCleanup';
import { setupFakeIndexedDB } from './fakeIndexedDb';

describe('reviewHistory', () => {
  setupFakeIndexedDB();

  const target = (normalizedName: string, tableId = normalizedName) => ({
    scope: { kind: 'anonymous' } as const,
    tableId,
    normalizedName,
  });

  const mockReview = {
    score: 8,
    summary: 'Test summary',
    suggestions: ['Suggestion 1', 'Suggestion 2'],
  };

  const savePersistedReview = async (...args: Parameters<typeof saveReview>) => {
    const record = await saveReview(...args);
    if (!record) throw new Error('Expected review to be persisted');
    return record;
  };

  it('preserves draft reviews when a table acquires a stable ID', async () => {
    const savedTarget = target('draft_review', 'saved-id');
    const draftTarget = { ...savedTarget, tableId: undefined, draftId: 'draft-review-id' };
    const record = await savePersistedReview(draftTarget, 'draft', 'ddl', 'mysql', mockReview);
    await migrateReviewsToTable(savedTarget, {
      draftId: draftTarget.draftId,
      normalizedName: draftTarget.normalizedName,
    });
    const reviews = await listReviews(savedTarget);
    expect(reviews.map((review) => review.id)).toEqual([record.id]);
    expect((await getReview(record.id, savedTarget))?.tableId).toBe('saved-id');
    expect((await listReviews(draftTarget)).map((review) => review.id)).toEqual([record.id]);
  });

  it('migrates only the matching workspace draft and keeps history through renames', async () => {
    const savedTarget = target('display_name', 'stable-id');
    const draft = {
      ...savedTarget,
      tableId: undefined,
      draftId: 'rename-draft-id',
      normalizedName: 'schema.sql_name',
    };
    const other = {
      ...draft,
      scope: { kind: 'user' as const, userId: 'user', workspaceId: 'workspace' },
    };
    const record = await savePersistedReview(draft, 'schema.sql_name', 'ddl', 'mysql', mockReview);
    const otherRecord = await savePersistedReview(
      other,
      'schema.sql_name',
      'other-ddl',
      'mysql',
      mockReview,
    );
    await migrateReviewsToTable(savedTarget, {
      draftId: draft.draftId,
      normalizedName: draft.normalizedName,
    });
    await migrateReviewsToTable(savedTarget, {
      draftId: draft.draftId,
      normalizedName: draft.normalizedName,
    });
    expect(
      (await listReviews({ ...savedTarget, normalizedName: 'renamed' })).map((review) => review.id),
    ).toEqual([record.id]);
    expect((await listReviews(other)).map((review) => review.id)).toEqual([otherRecord.id]);
    expect((await listReviews(draft)).map((review) => review.id)).toEqual([record.id]);
    expect(await listReviews({ ...savedTarget, tableId: 'different-id' })).toEqual([]);
  });

  it('can read a draft review directly by ID after saving', async () => {
    const savedTarget = target('direct_draft', 'direct-id');
    const draftTarget = {
      ...savedTarget,
      tableId: undefined,
      draftId: 'direct-draft-id',
    };
    const record = await savePersistedReview(draftTarget, 'draft', 'ddl', 'mysql', mockReview);
    await migrateReviewsToTable(savedTarget, {
      draftId: draftTarget.draftId,
      normalizedName: savedTarget.normalizedName,
    });
    expect((await getReview(record.id, savedTarget))?.tableId).toBe('direct-id');
  });

  it('带 draftId 的迁移不认领同名 legacy 评审', async () => {
    const savedTarget = target('shared_name', 'bound-table');
    const draftTarget = {
      ...savedTarget,
      tableId: undefined,
      draftId: 'bound-draft',
    };
    const legacyTarget = { ...savedTarget, tableId: undefined };
    const draft = await savePersistedReview(draftTarget, 'draft', 'draft-ddl', 'mysql', mockReview);
    const legacy = await savePersistedReview(
      legacyTarget,
      'legacy',
      'legacy-ddl',
      'mysql',
      mockReview,
    );

    await migrateReviewsToTable(savedTarget, {
      draftId: draftTarget.draftId,
      normalizedName: draftTarget.normalizedName,
    });

    expect((await listReviews(savedTarget)).map((review) => review.id)).toEqual([draft.id]);
    expect((await listReviews(legacyTarget)).map((review) => review.id)).toEqual([legacy.id]);
  });

  it('拒绝把同一 draftId 重新绑定到另一张表', async () => {
    const draftId = 'single-owner-draft';
    const first = target('first', 'first-table');
    const second = target('second', 'second-table');
    await migrateReviewsToTable(first, { draftId, normalizedName: 'draft' });

    await expect(
      migrateReviewsToTable(second, { draftId, normalizedName: 'draft' }),
    ).rejects.toThrow('评审草稿已绑定到其他表');
  });

  it('工作区历史清理同时删除 draft binding', async () => {
    const draftId = 'cleared-binding-draft';
    const first = target('first', 'cleared-first-table');
    const second = target('second', 'cleared-second-table');
    await migrateReviewsToTable(first, { draftId, normalizedName: 'draft' });

    await clearWorkspaceHistory(first.scope);

    await expect(
      migrateReviewsToTable(second, { draftId, normalizedName: 'draft' }),
    ).resolves.toBeUndefined();
  });

  it('should save and list reviews', async () => {
    const tableNamespace = 'test_table_1';
    const tableName = 'test_table';
    const ddl = 'CREATE TABLE test_table (id INT)';
    const dbType = 'mysql';

    const reviewTarget = target(tableNamespace);
    const record = await savePersistedReview(reviewTarget, tableName, ddl, dbType, mockReview);

    expect(record.id).toBeDefined();
    expect(record.tableNormalizedName).toBe(tableNamespace);
    expect(record.tableName).toBe(tableName);
    expect(record.ddl).toBe(ddl);
    expect(record.result).toEqual(mockReview);

    const list = await listReviews(reviewTarget);
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(record.id);
  });

  it('should get a specific review by id', async () => {
    const tableNamespace = 'test_get_id';
    const reviewTarget = target(tableNamespace);
    const record = await savePersistedReview(reviewTarget, 'table', 'ddl', 'mysql', mockReview);

    const found = await getReview(record.id, reviewTarget);
    expect(found).not.toBeNull();
    expect(found?.id).toBe(record.id);

    const nonExistent = await getReview('non-existent', reviewTarget);
    expect(nonExistent).toBeNull();
  });

  it('should delete a review', async () => {
    const tableNamespace = 'test_delete';
    const reviewTarget = target(tableNamespace);
    const record = await savePersistedReview(reviewTarget, 'table', 'ddl', 'mysql', mockReview);

    await deleteReview(record.id, reviewTarget);
    const found = await getReview(record.id, reviewTarget);
    expect(found).toBeNull();

    expect(await listReviews(reviewTarget)).toEqual([]);
  });

  it('拦截删除标记后的写入，并清理标记前启动的写入', async () => {
    const deleted = target('deleted_review', 'deleted-id');
    const pendingSave = saveReview(deleted, 'deleted', 'pending-ddl', 'mysql', mockReview);

    const operationId = await beginWorkspaceEntityDeletion(deleted);
    await pendingSave;
    await pruneOldReviews(deleted, 0);

    expect(await listReviews(deleted)).toEqual([]);
    expect(await saveReview(deleted, 'deleted', 'late-ddl', 'mysql', mockReview)).toBeNull();
    expect(await listReviews(deleted)).toEqual([]);

    await cancelWorkspaceEntityDeletion(deleted, operationId);
    expect(
      await saveReview(deleted, 'restored', 'restored-ddl', 'mysql', mockReview),
    ).not.toBeNull();
    expect((await listReviews(deleted)).map((review) => review.ddl)).toEqual(['restored-ddl']);
  });

  it('同步主删除失败时回滚 stable marker', async () => {
    const deleted = target('atomic_delete', 'atomic-delete-id');
    const draftTarget = { ...deleted, tableId: undefined, draftId: 'independent-draft' };

    await expect(
      beginWorkspaceEntityDeletion(deleted, () => {
        throw new Error('main delete failed');
      }),
    ).rejects.toThrow('main delete failed');

    expect(await saveReview(deleted, 'saved', 'saved-ddl', 'mysql', mockReview)).not.toBeNull();
    expect(await saveReview(draftTarget, 'draft', 'draft-ddl', 'mysql', mockReview)).not.toBeNull();
  });

  it('按工作区隔离删除标记', async () => {
    const anonymous = target('shared_deleted', 'marker-shared-id');
    const user = {
      ...anonymous,
      scope: { kind: 'user' as const, userId: 'user', workspaceId: 'workspace' },
    };

    await beginWorkspaceEntityDeletion(anonymous);

    expect(await saveReview(anonymous, 'anonymous', 'ddl-a', 'mysql', mockReview)).toBeNull();
    expect(await saveReview(user, 'user', 'ddl-b', 'mysql', mockReview)).not.toBeNull();
    expect(await listReviews(anonymous)).toEqual([]);
    expect(await listReviews(user)).toHaveLength(1);
  });

  it('删除标记后不把草稿评审迁入已删除表', async () => {
    const savedTarget = target('blocked_migration', 'blocked-migration-id');
    const draftTarget = {
      ...savedTarget,
      tableId: undefined,
      draftId: 'blocked-migration-draft',
    };
    await savePersistedReview(draftTarget, 'draft', 'ddl', 'mysql', mockReview);
    const operationId = await beginWorkspaceEntityDeletion(savedTarget);
    await finalizeWorkspaceEntityDeletion(savedTarget, operationId);

    await migrateReviewsToTable(savedTarget, {
      draftId: draftTarget.draftId,
      normalizedName: draftTarget.normalizedName,
    });

    expect(await listReviews(savedTarget)).toEqual([]);
    expect(await listReviews(draftTarget)).toEqual([]);
    expect(await saveReview(draftTarget, 'late', 'late-ddl', 'mysql', mockReview)).toBeNull();
  });

  it('deleting 撤销时保留迁移后的草稿评审', async () => {
    const savedTarget = target('cancelled_migration', 'cancelled-migration-id');
    const draftTarget = {
      ...savedTarget,
      tableId: undefined,
      draftId: 'cancelled-migration-draft',
    };
    const draft = await savePersistedReview(draftTarget, 'draft', 'ddl', 'mysql', mockReview);
    const operationId = await beginWorkspaceEntityDeletion(savedTarget);

    await migrateReviewsToTable(savedTarget, {
      draftId: draftTarget.draftId,
      normalizedName: draftTarget.normalizedName,
    });
    await cancelWorkspaceEntityDeletion(savedTarget, operationId);

    expect((await listReviews(savedTarget)).map((review) => review.id)).toEqual([draft.id]);
  });

  it('绑定后的旧草稿迟到结果受 stable 删除标记拦截', async () => {
    const savedTarget = target('renamed_table', 'late-bound-table');
    const draftTarget = {
      ...savedTarget,
      tableId: undefined,
      draftId: 'late-bound-draft',
      normalizedName: 'schema.old_name',
    };
    await migrateReviewsToTable(savedTarget, {
      draftId: draftTarget.draftId,
      normalizedName: draftTarget.normalizedName,
    });
    const operationId = await beginWorkspaceEntityDeletion(savedTarget);
    await finalizeWorkspaceEntityDeletion(savedTarget, operationId);

    expect(await saveReview(draftTarget, 'old', 'late-ddl', 'mysql', mockReview)).toBeNull();
    expect(await listReviews(savedTarget)).toEqual([]);
  });

  it('删除 saved table 不影响同名独立草稿', async () => {
    const savedTarget = target('users', 'saved-users');
    const savedDraft = {
      ...savedTarget,
      tableId: undefined,
      draftId: 'saved-users-draft',
    };
    const independentDraft = {
      ...savedTarget,
      tableId: undefined,
      draftId: 'independent-users-draft',
    };
    await savePersistedReview(savedDraft, 'saved users', 'saved-ddl', 'mysql', mockReview);
    await migrateReviewsToTable(savedTarget, {
      draftId: savedDraft.draftId,
      normalizedName: savedDraft.normalizedName,
    });
    const independent = await savePersistedReview(
      independentDraft,
      'draft users',
      'draft-ddl',
      'mysql',
      mockReview,
    );
    const operationId = await beginWorkspaceEntityDeletion(savedTarget);
    await finalizeWorkspaceEntityDeletion(savedTarget, operationId);

    expect((await listReviews(independentDraft)).map((review) => review.id)).toEqual([
      independent.id,
    ]);
    expect(
      await saveReview(independentDraft, 'draft users', 'late', 'mysql', mockReview),
    ).not.toBeNull();
  });

  it('isolates same-name reviews by workspace', async () => {
    const normalizedName = 'shared_review_table';
    const anonymousTarget = target(normalizedName, 'shared-id');
    const userTarget = {
      scope: {
        kind: 'user' as const,
        userId: 'user-1',
        workspaceId: 'workspace-1',
      },
      tableId: 'shared-id',
      normalizedName,
    };

    await saveReview(anonymousTarget, 'anonymous', 'ddl-a', 'mysql', mockReview);
    await saveReview(userTarget, 'user', 'ddl-b', 'mysql', mockReview);

    expect((await listReviews(anonymousTarget)).map((review) => review.tableName)).toEqual([
      'anonymous',
    ]);
    expect((await listReviews(userTarget)).map((review) => review.tableName)).toEqual(['user']);
  });

  it('does not read or delete a review owned by another workspace', async () => {
    const normalizedName = 'protected_review_table';
    const owner = target(normalizedName, 'owner-id');
    const otherWorkspace = {
      scope: {
        kind: 'user' as const,
        userId: 'user-2',
        workspaceId: 'workspace-2',
      },
      tableId: 'owner-id',
      normalizedName,
    };
    const record = await savePersistedReview(owner, 'owner', 'ddl', 'mysql', mockReview);

    expect(await getReview(record.id, otherWorkspace)).toBeNull();
    await deleteReview(record.id, otherWorkspace);
    expect(await getReview(record.id, owner)).not.toBeNull();
  });

  it('cannot claim unscoped legacy reviews during a read', async () => {
    const normalizedName = 'legacy_review_table';
    const owner = target(normalizedName, 'legacy-owner');
    const otherWorkspace = {
      scope: {
        kind: 'user' as const,
        userId: 'legacy-user',
        workspaceId: 'legacy-workspace',
      },
      tableId: 'legacy-owner',
      normalizedName,
    };
    const db = await dbUtils.openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(dbUtils.REVIEW_STORE_NAME, 'readwrite');
      tx.objectStore(dbUtils.REVIEW_STORE_NAME).add({
        id: 'legacy-review',
        tableNormalizedName: normalizedName,
        tableName: 'legacy',
        ddl: 'ddl',
        dbType: 'mysql',
        result: mockReview,
        createdAt: Date.now(),
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    const stolen = await listReviews(otherWorkspace);
    expect(stolen).toEqual([]);
    expect(await listReviews(owner)).toEqual([]);
    expect(await listReviews(otherWorkspace)).toEqual([]);
  });

  it('保留旧 name 归属数据，但 deleted stable target 不再读到它', async () => {
    const savedTarget = target('legacy_read', 'legacy:legacy_read');
    const legacyTarget = { ...savedTarget, tableId: undefined };
    const db = await dbUtils.openDb();
    await runIndexedDbTransaction(db, dbUtils.REVIEW_STORE_NAME, 'readwrite', (tx) => {
      tx.objectStore(dbUtils.REVIEW_STORE_NAME).add({
        id: 'legacy-readable-review',
        tableKey: 'anonymous::legacy:legacy_read',
        tableId: savedTarget.tableId,
        tableNormalizedName: savedTarget.normalizedName,
        tableName: 'legacy',
        ddl: 'ddl',
        dbType: 'mysql',
        result: mockReview,
        createdAt: 1,
      });
      return () => undefined;
    });
    expect(await listReviews(savedTarget)).toHaveLength(1);

    const operationId = await beginWorkspaceEntityDeletion(savedTarget);
    await finalizeWorkspaceEntityDeletion(savedTarget, operationId);

    expect(await listReviews(savedTarget)).toEqual([]);
    expect(await getReview('legacy-readable-review', savedTarget)).toBeNull();
    expect(await listReviews(legacyTarget)).toHaveLength(1);
  });

  it('should return zero when prune limit is not exceeded', async () => {
    const tableNamespace = 'test_prune_noop';
    const reviewTarget = target(tableNamespace);
    await saveReview(reviewTarget, 't1', 'd1', 'mysql', mockReview);

    const deletedCount = await pruneOldReviews(reviewTarget, 10);
    expect(deletedCount).toBe(0);
  });

  it('should list all reviews and return metadata projection', async () => {
    const tableNamespace = 'test_metadata';
    const reviewTarget = target(tableNamespace);
    await saveReview(reviewTarget, 'meta_table', 'ddl', 'postgresql', {
      ...mockReview,
      score: 9,
      summary: 'Metadata summary',
    });

    const metadataList = await listReviewMetadata(reviewTarget);
    expect(metadataList).toHaveLength(1);
    expect(metadataList[0].tableName).toBe('meta_table');
    expect(metadataList[0].dbType).toBe('postgresql');
    expect(metadataList[0].score).toBe(9);
    expect(metadataList[0].summary).toBe('Metadata summary');
    expect(metadataList[0]).not.toHaveProperty('ddl');
    expect(metadataList[0]).not.toHaveProperty('result');
  });

  it('should handle IndexedDB request error fallback when error is null/undefined', async () => {
    const mockRequest: any = {
      onerror: null,
      onsuccess: null,
    };

    const mockStore: any = {
      get: () => {
        setTimeout(() => {
          if (mockRequest.onerror) mockRequest.onerror();
        }, 10);
        return mockRequest;
      },
    };

    const mockTx: any = {
      objectStore: () => mockStore,
      onerror: null,
      onabort: null,
    };

    const mockDb: any = {
      transaction: () => mockTx,
    };

    vi.spyOn(dbUtils, 'openDb').mockResolvedValue(mockDb as unknown as IDBDatabase);

    await expect(saveReview(target('ns'), 'tb', 'ddl', 'mysql', mockReview)).rejects.toThrow(
      'IndexedDB 请求失败',
    );

    vi.restoreAllMocks();
  });
});
