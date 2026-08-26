import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { useDraftRecords } from '@/hooks/workspacePersistence/useDraftRecords';
import type { usePersistenceQueue } from '@/hooks/workspacePersistence/usePersistenceQueue';
import type { WorkspaceStorageTarget } from '@/hooks/workspacePersistence/useWorkspaceStorageTarget';

const createState = (tableName: string): PersistedState => ({
  schemaName: '',
  tableName,
  tableComment: '',
  dbType: 'mysql',
  sqlFormatMode: 'compact',
  rows: [],
  addCount: 1,
  indexInput: '',
  currentIndexFields: [],
  indexes: [],
  authInput: '',
  authObjects: [],
});

const renderDraftRecords = (
  overrides: {
    storage?: Partial<WorkspaceStorageTarget>;
    enqueuePersistence?: ReturnType<typeof usePersistenceQueue>['enqueue'];
  } = {},
) => {
  const storage = {
    kind: 'ydoc' as const,
    read: vi.fn(),
    readLocal: vi.fn(),
    update: vi.fn(),
    write: vi.fn(),
    cleanupLocal: vi.fn(),
    removeEverywhere: vi.fn(),
    ...overrides.storage,
  };
  const enqueuePersistence =
    overrides.enqueuePersistence ?? vi.fn((_key, _operation, run) => run());
  return renderHook(() =>
    useDraftRecords({
      disabled: false,
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

  it('updates the derived summary when a synchronized record is cached', () => {
    const { result } = renderDraftRecords();
    act(() => {
      result.current.cacheDraftRecord('draft-1', {
        state: createState('users'),
        createdAt: 1,
        updatedAt: 10,
      });
    });
    act(() => {
      result.current.cacheDraftRecord('draft-1', {
        state: createState('customers'),
        createdAt: 1,
        updatedAt: 11,
      });
    });

    expect(result.current.draftSummaries).toEqual([
      expect.objectContaining({ name: 'customers', updatedAt: 11 }),
    ]);
  });

  it('keeps a trashed draft visible until permanent deletion succeeds', async () => {
    let finishDeletion!: () => void;
    const removeEverywhere = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishDeletion = resolve;
        }),
    );
    const { result } = renderDraftRecords({ storage: { removeEverywhere } });
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
      storage: { write: vi.fn().mockRejectedValue(new Error('restore failed')) },
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
