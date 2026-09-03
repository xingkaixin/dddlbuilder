import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFolderTreeNode, createSavedTableMetadata } from '@/__tests__/utils/testFactories';
import { useWorkspaceTrashActions } from '@/components/App/hooks/useWorkspaceTrashActions';
import type { FolderTreeNode } from '@/hooks/useFolders';

type WorkspaceTrashActionsParams = Parameters<typeof useWorkspaceTrashActions>[0];

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

const nestedFolder: FolderTreeNode = createFolderTreeNode('nested', {
  name: 'Nested',
  order: 1,
});
const folderTree: FolderTreeNode[] = [
  createFolderTreeNode('root', { name: 'Root', order: 1, children: [nestedFolder] }),
];

const renderActions = (overrides: Partial<WorkspaceTrashActionsParams> = {}) => {
  const params: WorkspaceTrashActionsParams = {
    folderTree,
    trashedTables: [],
    trashedDrafts: [],
    restoreTable: vi.fn<WorkspaceTrashActionsParams['restoreTable']>().mockResolvedValue({
      ok: true,
      normalizedName: 'users',
      tableId: 'table-users',
    }),
    restoreDraftById: vi
      .fn<WorkspaceTrashActionsParams['restoreDraftById']>()
      .mockResolvedValue(undefined),
    deleteTablePermanently: vi
      .fn<WorkspaceTrashActionsParams['deleteTablePermanently']>()
      .mockResolvedValue({
        ok: true,
        normalizedName: 'users',
        tableId: 'table-users',
      }),
    permanentlyDeleteDraftById: vi
      .fn<WorkspaceTrashActionsParams['permanentlyDeleteDraftById']>()
      .mockResolvedValue(undefined),
    ...overrides,
  };
  return { ...renderHook(() => useWorkspaceTrashActions(params)), params };
};

describe('useWorkspaceTrashActions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('restores a table to an existing nested folder', async () => {
    const restoreTable = vi.fn<WorkspaceTrashActionsParams['restoreTable']>().mockResolvedValue({
      ok: true,
      normalizedName: 'users',
      tableId: 'table-users',
    });
    const { result } = renderActions({ restoreTable });

    act(() =>
      result.current.handleRestoreTable(
        createSavedTableMetadata('table-users', {
          normalizedName: 'users',
          name: 'Users',
          fieldCount: 1,
          folderId: 'nested',
        }),
      ),
    );

    await waitFor(() => expect(restoreTable).toHaveBeenCalledOnce());
    expect(restoreTable.mock.calls[0]?.[1]?.existingFolderIds).toEqual(new Set(['root', 'nested']));
  });

  it('reports a failed draft restore without a success toast', async () => {
    const restoreDraftById = vi
      .fn<WorkspaceTrashActionsParams['restoreDraftById']>()
      .mockRejectedValue(new Error('restore failed'));
    const { result } = renderActions({ restoreDraftById });

    act(() => result.current.handleRestoreDraft('draft-1'));

    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledWith('restore failed'));
    expect(mocks.showToast).not.toHaveBeenCalledWith('savedTables.restore');
  });

  it('reports every failed item when emptying trash', async () => {
    const { result } = renderActions({
      trashedTables: [createSavedTableMetadata('table-users')],
      trashedDrafts: [
        {
          draftId: 'draft-1',
          name: 'Draft 1',
          dbType: 'mysql',
          fieldCount: 0,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      deleteTablePermanently: vi
        .fn<WorkspaceTrashActionsParams['deleteTablePermanently']>()
        .mockResolvedValue({
          ok: false,
          reason: 'error',
        }),
      permanentlyDeleteDraftById: vi
        .fn<WorkspaceTrashActionsParams['permanentlyDeleteDraftById']>()
        .mockRejectedValue(new Error('delete failed')),
    });

    act(() => result.current.handleConfirmEmptyTrash());

    await waitFor(() =>
      expect(mocks.showToast).toHaveBeenCalledWith('savedTables.toast.trashActionFailed:2'),
    );
    expect(mocks.showToast).not.toHaveBeenCalledWith('savedTables.deletePermanently');
  });
});
