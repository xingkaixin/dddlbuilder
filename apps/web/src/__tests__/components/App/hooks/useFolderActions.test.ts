import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useFolderActions } from '@/components/App/hooks/useFolderActions';
import type { FolderTreeNode } from '@/hooks/useFolders';
import type { SavedTableSummary } from '@/hooks/useSavedTables';

const targetFolder: FolderTreeNode = {
  id: 'folder-a',
  name: '业务表',
  order: 0,
  createdAt: 1,
  children: [],
};

const rootFolder: FolderTreeNode = {
  id: 'folder-root',
  name: '根目录',
  order: 0,
  createdAt: 1,
  children: [targetFolder],
};

const savedTable: SavedTableSummary = {
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
  const hook = renderHook(() =>
    useFolderActions({
      folderTree: [rootFolder],
      savedTables: [savedTable],
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
  };
}

describe('useFolderActions', () => {
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

  it('统计嵌套目录内受影响的表', () => {
    const { result } = renderFolderActions();

    act(() => result.current.handleOpenDeleteFolderDialog(rootFolder));

    expect(result.current.deleteFolderTableCount).toBe(1);
  });
});
