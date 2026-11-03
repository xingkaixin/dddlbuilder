import { describe, it, expect } from 'vitest';
import {
  saveReview,
  listReviews,
  getReview,
  deleteReview,
  migrateReviewsToTable,
  pruneOldReviews,
} from '@/utils/reviewHistory';
import {
  beginWorkspaceEntityDeletion,
  cancelWorkspaceEntityDeletion,
} from '@/utils/workspaceEntityDeletion';
import { finalizeWorkspaceEntityDeletion } from '@/services/workspaceHistoryCleanup';
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
});
