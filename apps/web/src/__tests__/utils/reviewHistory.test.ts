import { describe, it, expect, vi } from 'vitest';
import {
  saveReview,
  listReviews,
  listReviewMetadata,
  getReview,
  deleteReview,
  deleteAllReviews,
  migrateReviewsToTable,
  pruneOldReviews,
} from '@/utils/reviewHistory';
import * as dbUtils from '@/utils/workspaceDb';
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

  it('preserves draft reviews when a table acquires a stable ID', async () => {
    const savedTarget = target('draft_review', 'saved-id');
    const draftTarget = { ...savedTarget, tableId: undefined };
    const record = await saveReview(draftTarget, 'draft', 'ddl', 'mysql', mockReview);
    await migrateReviewsToTable(savedTarget, draftTarget.normalizedName);
    const reviews = await listReviews(savedTarget);
    expect(reviews.map((review) => review.id)).toEqual([record.id]);
    expect((await getReview(record.id, savedTarget))?.tableId).toBe('saved-id');
    expect(await listReviews(draftTarget)).toEqual([]);
  });

  it('migrates only the matching workspace draft and keeps history through renames', async () => {
    const savedTarget = target('display_name', 'stable-id');
    const draft = { ...savedTarget, tableId: undefined, normalizedName: 'schema.sql_name' };
    const other = {
      ...draft,
      scope: { kind: 'user' as const, userId: 'user', workspaceId: 'workspace' },
    };
    const record = await saveReview(draft, 'schema.sql_name', 'ddl', 'mysql', mockReview);
    const otherRecord = await saveReview(
      other,
      'schema.sql_name',
      'other-ddl',
      'mysql',
      mockReview,
    );
    await migrateReviewsToTable(savedTarget, draft.normalizedName);
    await migrateReviewsToTable(savedTarget, draft.normalizedName);
    expect(
      (await listReviews({ ...savedTarget, normalizedName: 'renamed' })).map((review) => review.id),
    ).toEqual([record.id]);
    expect((await listReviews(other)).map((review) => review.id)).toEqual([otherRecord.id]);
    expect(await listReviews(draft)).toEqual([]);
    expect(await listReviews({ ...savedTarget, tableId: 'different-id' })).toEqual([]);
  });

  it('can read a draft review directly by ID after saving', async () => {
    const savedTarget = target('direct_draft', 'direct-id');
    const record = await saveReview(
      { ...savedTarget, tableId: undefined },
      'draft',
      'ddl',
      'mysql',
      mockReview,
    );
    await migrateReviewsToTable(savedTarget, savedTarget.normalizedName);
    expect((await getReview(record.id, savedTarget))?.tableId).toBe('direct-id');
  });

  it('should save and list reviews', async () => {
    const tableNamespace = 'test_table_1';
    const tableName = 'test_table';
    const ddl = 'CREATE TABLE test_table (id INT)';
    const dbType = 'mysql';

    const reviewTarget = target(tableNamespace);
    const record = await saveReview(reviewTarget, tableName, ddl, dbType, mockReview);

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
    const record = await saveReview(reviewTarget, 'table', 'ddl', 'mysql', mockReview);

    const found = await getReview(record.id, reviewTarget);
    expect(found).not.toBeNull();
    expect(found?.id).toBe(record.id);

    const nonExistent = await getReview('non-existent', reviewTarget);
    expect(nonExistent).toBeNull();
  });

  it('should delete a review', async () => {
    const tableNamespace = 'test_delete';
    const reviewTarget = target(tableNamespace);
    const record = await saveReview(reviewTarget, 'table', 'ddl', 'mysql', mockReview);

    await deleteReview(record.id, reviewTarget);
    const found = await getReview(record.id, reviewTarget);
    expect(found).toBeNull();

    expect(await listReviews(reviewTarget)).toEqual([]);
  });

  it('deletes all table reviews without deleting other tables or workspaces', async () => {
    const owner = target('delete_all', 'owner');
    const anotherTable = target('delete_all', 'another');
    const anotherWorkspace = {
      ...owner,
      scope: { kind: 'user' as const, userId: 'user', workspaceId: 'workspace' },
    };
    await saveReview(owner, 'owner', 'ddl', 'mysql', mockReview);
    await saveReview(owner, 'owner', 'ddl-2', 'mysql', mockReview);
    await saveReview(anotherTable, 'another', 'ddl', 'mysql', mockReview);
    await saveReview(anotherWorkspace, 'other', 'ddl', 'mysql', mockReview);
    await deleteAllReviews(owner);
    await deleteAllReviews(owner);
    expect(await listReviews(owner)).toEqual([]);
    expect(await listReviews(anotherTable)).toHaveLength(1);
    expect(await listReviews(anotherWorkspace)).toHaveLength(1);
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
    const record = await saveReview(owner, 'owner', 'ddl', 'mysql', mockReview);

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
      add: () => {
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
