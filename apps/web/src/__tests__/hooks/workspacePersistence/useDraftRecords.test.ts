import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { useDraftRecords } from '@/hooks/workspacePersistence/useDraftRecords';
import { usePersistenceQueue } from '@/hooks/workspacePersistence/usePersistenceQueue';

// oxlint-disable-next-line anti-slop/no-module-mocking -- intercept only draft writes so the hook's persistence queue can be observed.
vi.mock(import('@/utils/workspaceStateDb'), async (importOriginal) => ({
  ...(await importOriginal()),
  writeDraft: vi.fn().mockResolvedValue(undefined),
  deleteDraft: vi.fn().mockResolvedValue(undefined),
}));

import { writeDraft, deleteDraft } from '@/utils/workspaceStateDb';

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

describe('draft persistence retry', () => {
  it.each(['restore'])('updates the catalog after retrying %s', async (operation) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const write = operation === 'restore' ? vi.mocked(writeDraft) : vi.mocked(deleteDraft);
    write.mockRejectedValueOnce(new Error('storage unavailable')).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => {
      const queue = usePersistenceQueue();

      const drafts = useDraftRecords({
        disabled: false,
        yDoc: null,
        enqueuePersistence: queue.enqueue,
        storage: { kind: 'indexeddb', scope: { kind: 'anonymous' } },
      });

      return { queue, drafts };
    });
    act(() =>
      result.current.drafts.replaceTrashedDrafts([
        {
          draftId: 'draft-1',
          record: { state: createState('users'), createdAt: 1, updatedAt: 2, trashedAt: 2 },
        },
      ]),
    );
    await act(async () => {
      const task =
        operation === 'restore'
          ? result.current.drafts.restoreDraftById('draft-1')
          : result.current.drafts.permanentlyDeleteDraftById('draft-1');
      await expect(task).rejects.toThrow('storage unavailable');
    });
    expect(result.current.drafts.trashedDrafts).toHaveLength(1);
    act(() => result.current.queue.retryFailed());
    await waitFor(() => {
      expect(result.current.drafts.trashedDrafts).toHaveLength(0);
      expect(result.current.drafts.draftSummaries).toHaveLength(operation === 'restore' ? 1 : 0);
    });
  });
});
