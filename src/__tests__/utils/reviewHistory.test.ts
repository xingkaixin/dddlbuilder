import { describe, it, expect, vi } from 'vitest';
import {
  saveReview,
  listReviews,
  listReviewMetadata,
  getReview,
  deleteReview,
  countReviews,
  pruneOldReviews,
} from '@/utils/reviewHistory';
import * as dbUtils from '@/utils/savedTablesDb';
import { setupFakeIndexedDB } from './fakeIndexedDb';

describe('reviewHistory', () => {
  setupFakeIndexedDB();

  const mockReview = {
    score: 8,
    summary: 'Test summary',
    suggestions: ['Suggestion 1', 'Suggestion 2'],
  };

  it('should save and list reviews', async () => {
    const tableNamespace = 'test_table_1';
    const tableName = 'test_table';
    const ddl = 'CREATE TABLE test_table (id INT)';
    const dbType = 'mysql';

    const record = await saveReview(tableNamespace, tableName, ddl, dbType, mockReview);

    expect(record.id).toBeDefined();
    expect(record.tableNormalizedName).toBe(tableNamespace);
    expect(record.tableName).toBe(tableName);
    expect(record.ddl).toBe(ddl);
    expect(record.result).toEqual(mockReview);

    const list = await listReviews(tableNamespace);
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(record.id);
  });

  it('should get a specific review by id', async () => {
    const tableNamespace = 'test_get_id';
    const record = await saveReview(tableNamespace, 'table', 'ddl', 'mysql', mockReview);

    const found = await getReview(record.id);
    expect(found).not.toBeNull();
    expect(found?.id).toBe(record.id);

    const nonExistent = await getReview('non-existent');
    expect(nonExistent).toBeNull();
  });

  it('should delete a review', async () => {
    const tableNamespace = 'test_delete';
    const record = await saveReview(tableNamespace, 'table', 'ddl', 'mysql', mockReview);

    await deleteReview(record.id);
    const found = await getReview(record.id);
    expect(found).toBeNull();

    const count = await countReviews(tableNamespace);
    expect(count).toBe(0);
  });

  it('should count reviews for a table', async () => {
    const tableNamespace = 'test_count';
    await saveReview(tableNamespace, 't1', 'd1', 'mysql', mockReview);
    await saveReview(tableNamespace, 't2', 'd2', 'mysql', mockReview);

    const count = await countReviews(tableNamespace);
    expect(count).toBe(2);

    const totalCount = await countReviews();
    expect(totalCount).toBeGreaterThanOrEqual(2);
  });

  it('should prune old reviews when limit is exceeded', async () => {
    const tableNamespace = 'test_prune';
    const maxCount = 3;

    // Save 5 reviews
    for (let i = 0; i < 5; i++) {
      // Small delay to ensure consistent ordering if based on timestamp
      await new Promise((r) => setTimeout(r, 10));
      await saveReview(tableNamespace, `t${i}`, `d${i}`, 'mysql', mockReview);
    }

    const countBefore = await countReviews(tableNamespace);
    expect(countBefore).toBe(5);

    const deletedCount = await pruneOldReviews(tableNamespace, maxCount);
    expect(deletedCount).toBe(2);

    const countAfter = await countReviews(tableNamespace);
    expect(countAfter).toBe(3);

    // Verify the latest 3 are kept (they are sorted by createdAt desc)
    const list = await listReviews(tableNamespace);
    expect(list[0].tableName).toBe('t4');
    expect(list[1].tableName).toBe('t3');
    expect(list[2].tableName).toBe('t2');
  });

  it('should return zero when prune limit is not exceeded', async () => {
    const tableNamespace = 'test_prune_noop';
    await saveReview(tableNamespace, 't1', 'd1', 'mysql', mockReview);

    const deletedCount = await pruneOldReviews(tableNamespace, 10);
    expect(deletedCount).toBe(0);
  });

  it('should list all reviews and return metadata projection', async () => {
    const tableNamespace = 'test_metadata';
    await saveReview(tableNamespace, 'meta_table', 'ddl', 'postgresql', {
      ...mockReview,
      score: 9,
      summary: 'Metadata summary',
    });

    const allReviews = await listReviews();
    expect(allReviews.length).toBeGreaterThan(0);

    const metadataList = await listReviewMetadata(tableNamespace);
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

    await expect(saveReview('ns', 'tb', 'ddl', 'mysql', mockReview)).rejects.toThrow(
      'IndexedDB 请求失败',
    );

    vi.restoreAllMocks();
  });
});
