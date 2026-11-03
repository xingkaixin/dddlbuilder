import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFolderActions } from '@/components/App/hooks/useFolderActions';
import type { FolderTreeNode } from '@/hooks/useFolders';
import type { SavedTableSummary } from '@/hooks/useSavedTables';
import { useTabStore } from '@/stores';

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

  return hook;
}

describe('useFolderActions', () => {
  beforeEach(() => useTabStore.setState({ tabs: [], activeTabId: null }));

  it('统计嵌套目录内受影响的表和草稿', () => {
    const { result } = renderFolderActions();

    act(() => result.current.handleOpenDeleteFolderDialog(rootFolder));

    expect(result.current.deleteFolderTableCount).toBe(2);
  });
});
