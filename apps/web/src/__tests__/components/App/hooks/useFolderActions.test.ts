import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFolderActions } from '@/components/App/hooks/useFolderActions';
import type { FolderTreeNode } from '@/hooks/useFolders';
import type { SavedTableSummary } from '@/hooks/useSavedTables';
import { useEditorStore, useTabStore } from '@/stores';
import { toPersistedState } from '@/stores/editorDocumentCodec';

const targetFolder: FolderTreeNode = {
  id: 'folder-a',
  name: '业务表',
  order: 0,
  createdAt: 1,
  updatedAt: 1,
  children: [],
};

const rootFolder: FolderTreeNode = {
  id: 'folder-root',
  name: '根目录',
  order: 0,
  createdAt: 1,
  updatedAt: 1,
  children: [targetFolder],
};

const savedTable: SavedTableSummary = {
  tableId: 'users',
  normalizedName: 'users',
  name: 'users',
  dbType: 'mysql',
  fieldCount: 2,
  folderId: targetFolder.id,
  createdAt: 1,
  updatedAt: 1,
};

const addDraftTab = (draftId: string, isLoading = false) =>
  useTabStore.getState().addTab({
    title: draftId,
    source: { kind: 'draft', draftId },
    stateSnapshot: toPersistedState(useEditorStore.getInitialState()),
    isLoading,
  });

function renderFolderActions() {
  const deleteFolderAction = vi.fn().mockResolvedValue([targetFolder.id]);
  const createFolder = vi.fn();
  const showToast = vi.fn();
  const getDraftState = vi.fn();
  const refreshDrafts = vi.fn().mockResolvedValue(undefined);
  const closeTab = vi.fn(useTabStore.getState().closeTab);
  const hook = renderHook(() =>
    useFolderActions({
      folderTree: [rootFolder],
      savedTables: [savedTable],
      drafts: {
        draftSummaries: [
          {
            draftId: 'draft',
            name: 'Draft',
            dbType: 'mysql',
            fieldCount: 1,
            folderId: targetFolder.id,
            createdAt: 1,
            updatedAt: 1,
          },
        ],
        getDraftState,
        refreshDrafts,
      },
      closeTab,
      createFolder,
      renameFolder: vi.fn(),
      moveFolder: vi.fn(),
      deleteFolderAction,
      moveTableToFolder: vi.fn(),
      showToast,
    }),
  );

  return {
    ...hook,
    deleteFolderAction,
    createFolder,
    showToast,
    getDraftState,
    refreshDrafts,
    closeTab,
  };
}

describe('useFolderActions', () => {
  beforeEach(() => useTabStore.setState({ tabs: [], activeTabId: null }));
  it('在一次存储操作中删除文件夹及其中的表', async () => {
    const { result, deleteFolderAction, showToast } = renderFolderActions();

    act(() => result.current.handleOpenDeleteFolderDialog(targetFolder));
    await act(() => result.current.handleDeleteFolderConfirm());

    expect(deleteFolderAction).toHaveBeenCalledWith(targetFolder.id);
    expect(showToast).toHaveBeenCalledWith('已删除文件夹：业务表');
  });

  it('能在嵌套文件夹下继续创建子文件夹', async () => {
    const { result, createFolder } = renderFolderActions();

    act(() => result.current.handleOpenCreateFolderDialog(targetFolder.id));
    await act(() => result.current.handleFolderDialogConfirm('审计表'));

    expect(createFolder).toHaveBeenCalledWith('审计表', targetFolder.id);
  });

  it('统计嵌套目录内受影响的表和草稿', () => {
    const { result } = renderFolderActions();

    act(() => result.current.handleOpenDeleteFolderDialog(rootFolder));

    expect(result.current.deleteFolderTableCount).toBe(2);
  });

  it('删除目录不会关闭原本尚未加载的草稿标签', async () => {
    const tabId = addDraftTab('loading-draft', true);
    const { result, getDraftState, closeTab } = renderFolderActions();
    getDraftState.mockReturnValue(null);

    act(() => result.current.handleOpenDeleteFolderDialog(targetFolder));
    await act(() => result.current.handleDeleteFolderConfirm());

    expect(useTabStore.getState().getTabById(tabId)?.isLoading).toBe(true);
    expect(closeTab).not.toHaveBeenCalled();
  });

  it('旧目录操作完成后不会关闭新工作区的标签', async () => {
    addDraftTab('old-draft');
    const { result, unmount, deleteFolderAction, getDraftState, closeTab } = renderFolderActions();
    getDraftState.mockReturnValue(toPersistedState(useEditorStore.getInitialState()));
    let completeDelete!: (folderIds: string[]) => void;
    deleteFolderAction.mockReturnValue(
      new Promise<string[]>((resolve) => {
        completeDelete = resolve;
      }),
    );
    act(() => result.current.handleOpenDeleteFolderDialog(targetFolder));
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.handleDeleteFolderConfirm();
    });
    unmount();
    useTabStore.setState({ tabs: [], activeTabId: null });
    const newTabId = addDraftTab('new-user-draft');
    getDraftState.mockReturnValue(null);

    await act(async () => {
      completeDelete([targetFolder.id]);
      await pending;
    });

    expect(useTabStore.getState().getTabById(newTabId)?.source).toEqual({
      kind: 'draft',
      draftId: 'new-user-draft',
    });
    expect(closeTab).not.toHaveBeenCalled();
  });
});
