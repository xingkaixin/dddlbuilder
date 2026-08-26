import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceTrashActions } from '@/components/App/hooks/useWorkspaceTrashActions';
import type { FolderTreeNode } from '@/hooks/useFolders';

const mocks = vi.hoisted(() => ({ showToast: vi.fn() }));

vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({ showToast: mocks.showToast }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      options?.count == null ? key : `${key}:${options.count}`,
  }),
}));

const nestedFolder: FolderTreeNode = {
  id: 'nested',
  name: 'Nested',
  order: 1,
  createdAt: 1,
  children: [],
};
const folderTree: FolderTreeNode[] = [
  { id: 'root', name: 'Root', order: 1, createdAt: 1, children: [nestedFolder] },
];

const renderActions = (overrides: Record<string, unknown> = {}) => {
  const params = {
    folderTree,
    trashedTables: [],
    trashedDrafts: [],
    restoreTable: vi.fn().mockResolvedValue({ ok: true, normalizedName: 'users' }),
    restoreDraftById: vi.fn().mockResolvedValue(undefined),
    deleteTablePermanently: vi.fn().mockResolvedValue({ ok: true, normalizedName: 'users' }),
    permanentlyDeleteDraftById: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return { ...renderHook(() => useWorkspaceTrashActions(params as never)), params };
};

describe('useWorkspaceTrashActions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('restores a table to an existing nested folder', async () => {
    const restoreTable = vi.fn().mockResolvedValue({ ok: true, normalizedName: 'users' });
    const { result } = renderActions({ restoreTable });

    act(() =>
      result.current.handleRestoreTable({
        normalizedName: 'users',
        name: 'Users',
        dbType: 'mysql',
        fieldCount: 1,
        folderId: 'nested',
        createdAt: 1,
        updatedAt: 1,
      }),
    );

    await waitFor(() => expect(restoreTable).toHaveBeenCalledOnce());
    expect(restoreTable.mock.calls[0]?.[1]?.existingFolderIds).toEqual(new Set(['root', 'nested']));
  });

  it('reports a failed draft restore without a success toast', async () => {
    const restoreDraftById = vi.fn().mockRejectedValue(new Error('restore failed'));
    const { result } = renderActions({ restoreDraftById });

    act(() => result.current.handleRestoreDraft('draft-1'));

    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledWith('restore failed'));
    expect(mocks.showToast).not.toHaveBeenCalledWith('savedTables.restore');
  });

  it('reports every failed item when emptying trash', async () => {
    const { result } = renderActions({
      trashedTables: [{ normalizedName: 'users' }],
      trashedDrafts: [{ draftId: 'draft-1' }],
      deleteTablePermanently: vi.fn().mockResolvedValue({ ok: false, reason: 'error' }),
      permanentlyDeleteDraftById: vi.fn().mockRejectedValue(new Error('delete failed')),
    });

    act(() => result.current.handleConfirmEmptyTrash());

    await waitFor(() =>
      expect(mocks.showToast).toHaveBeenCalledWith('savedTables.toast.trashActionFailed:2'),
    );
    expect(mocks.showToast).not.toHaveBeenCalledWith('savedTables.deletePermanently');
  });
});
