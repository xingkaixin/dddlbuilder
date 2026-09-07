import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { useDraftRecords } from '@/hooks/workspacePersistence/useDraftRecords';
import { usePersistenceQueue } from '@/hooks/workspacePersistence/usePersistenceQueue';
import type { WorkspaceStorageTarget } from '@/hooks/workspacePersistence/useWorkspaceStorageTarget';

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

const renderDraftRecords = (
  overrides: {
    storage?: WorkspaceStorageTarget;
    enqueuePersistence?: ReturnType<typeof usePersistenceQueue>['enqueue'];
  } = {},
) => {
  const storage: WorkspaceStorageTarget = overrides.storage ?? {
    kind: 'indexeddb' as const,
    scope: { kind: 'anonymous' },
  };
  const enqueuePersistence = overrides.enqueuePersistence ?? vi.fn(async () => undefined);
  return renderHook(() =>
    useDraftRecords({
      disabled: false,
      yDoc: null,
      enqueuePersistence,
      storage,
    }),
  );
};

describe('useDraftRecords', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('derives folder and timestamp changes from the draft record', () => {
    vi.useFakeTimers();
    vi.setSystemTime(20);
    const { result } = renderDraftRecords();
    act(() => {
      result.current.replaceDrafts([
        {
          draftId: 'draft-1',
          record: { state: createState('users'), createdAt: 1, updatedAt: 10 },
        },
      ]);
    });

    act(() => result.current.moveDraftToFolder('draft-1', 'folder-1'));

    expect(result.current.draftSummaries).toEqual([
      expect.objectContaining({
        draftId: 'draft-1',
        folderId: 'folder-1',
        createdAt: 1,
        updatedAt: 20,
      }),
    ]);
  });

  it('updates the local summary when draft state changes', () => {
    const { result } = renderDraftRecords();
    act(() => result.current.saveDraftState('draft-1', createState('users')));
    act(() => result.current.saveDraftState('draft-1', createState('customers')));

    expect(result.current.draftSummaries).toEqual([expect.objectContaining({ name: 'customers' })]);
  });

  it('keeps a trashed draft visible until permanent deletion succeeds', async () => {
    let finishDeletion!: () => void;
    const enqueuePersistence = vi.fn(
      (_key: string, _operation: string, run: () => Promise<unknown>) =>
        new Promise<void>((resolve) => {
          finishDeletion = () => {
            void run().then(() => resolve());
          };
        }),
    );
    const { result } = renderDraftRecords({ enqueuePersistence });
    act(() => {
      result.current.replaceTrashedDrafts([
        {
          draftId: 'draft-1',
          record: { state: createState('users'), createdAt: 1, updatedAt: 2, trashedAt: 2 },
        },
      ]);
    });

    let completion!: Promise<void>;
    act(() => {
      completion = result.current.permanentlyDeleteDraftById('draft-1');
    });
    expect(result.current.trashedDrafts).toHaveLength(1);

    await act(async () => {
      finishDeletion();
      await completion;
    });
    expect(result.current.trashedDrafts).toHaveLength(0);
  });

  it('keeps a trashed draft when restore persistence fails', async () => {
    const { result } = renderDraftRecords({
      enqueuePersistence: vi.fn().mockRejectedValue(new Error('restore failed')),
    });
    act(() => {
      result.current.replaceTrashedDrafts([
        {
          draftId: 'draft-1',
          record: { state: createState('users'), createdAt: 1, updatedAt: 2, trashedAt: 2 },
        },
      ]);
    });

    await expect(result.current.restoreDraftById('draft-1')).rejects.toThrow('restore failed');

    expect(result.current.trashedDrafts).toHaveLength(1);
  });
});

describe('draft persistence retry', () => {
  it.each(['restore', 'delete'] as const)(
    'updates the catalog after retrying %s',
    async (operation) => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const write = operation === 'restore' ? vi.mocked(writeDraft) : vi.mocked(deleteDraft);
      write
        .mockRejectedValueOnce(new Error('storage unavailable'))
        .mockResolvedValueOnce(undefined);
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
        expect(result.current.queue.failure).toBeNull();
        expect(result.current.drafts.trashedDrafts).toHaveLength(0);
        expect(result.current.drafts.draftSummaries).toHaveLength(operation === 'restore' ? 1 : 0);
      });
    },
  );
});
