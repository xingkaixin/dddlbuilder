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
  const deleteTable = vi.fn().mockResolvedValue({
    ok: false as const,
    reason: 'error' as const,
    message: '写入失败',
  });
  const showToast = vi.fn();
  const hook = renderHook(() =>
    useFolderActions({
      folderTree: [targetFolder],
      savedTables: [savedTable],
      createFolder: vi.fn(),
      renameFolder: vi.fn(),
      moveFolder: vi.fn(),
      deleteFolderAction,
      deleteTable,
      moveTableToFolder: vi.fn(),
      showToast,
    }),
  );

  return {
    ...hook,
    deleteFolderAction,
    deleteTable,
    showToast,
  };
}

describe('useFolderActions', () => {
  it('表删除失败时不应删除文件夹或提示成功', async () => {
    const { result, deleteFolderAction, deleteTable, showToast } = renderFolderActions();

    act(() => result.current.handleOpenDeleteFolderDialog(targetFolder));
    await act(() => result.current.handleDeleteFolderConfirm());

    expect(deleteTable).toHaveBeenCalledWith(savedTable.normalizedName);
    expect(deleteFolderAction).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith('写入失败');
  });
});
