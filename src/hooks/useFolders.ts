import { useState, useCallback, useEffect } from 'react';
import type { TableFolder } from '@/utils/savedTablesDb';
import {
  listFolders,
  createFolder,
  renameFolder,
  deleteFolder,
  moveFolder,
  buildFolderTree,
  getDescendantFolderIds,
  type FolderTreeNode,
} from '@/utils/tableFolders';

export type { FolderTreeNode };

interface UseFoldersState {
  folders: TableFolder[];
  folderTree: FolderTreeNode[];
  loading: boolean;
  error: string | null;
}

export function useFolders() {
  const [state, setState] = useState<UseFoldersState>({
    folders: [],
    folderTree: [],
    loading: true,
    error: null,
  });

  // 加载文件夹列表
  const loadFolders = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const [folders, folderTree] = await Promise.all([listFolders(), buildFolderTree()]);
      setState({
        folders,
        folderTree,
        loading: false,
        error: null,
      });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : '加载文件夹失败',
      }));
    }
  }, []);

  // 初始加载
  useEffect(() => {
    void loadFolders();
  }, [loadFolders]);

  // 创建文件夹
  const handleCreateFolder = useCallback(
    async (name: string, parentId?: string) => {
      try {
        const folder = await createFolder(name, parentId);
        await loadFolders();
        return folder;
      } catch (err) {
        throw err instanceof Error ? err : new Error('创建文件夹失败');
      }
    },
    [loadFolders],
  );

  // 重命名文件夹
  const handleRenameFolder = useCallback(
    async (id: string, newName: string) => {
      try {
        await renameFolder(id, newName);
        await loadFolders();
      } catch (err) {
        throw err instanceof Error ? err : new Error('重命名文件夹失败');
      }
    },
    [loadFolders],
  );

  // 删除文件夹
  const handleDeleteFolder = useCallback(
    async (id: string) => {
      try {
        // 获取所有受影响的文件夹 ID（包括子文件夹）
        const descendantIds = await getDescendantFolderIds(id);
        const allFolderIds = [id, ...descendantIds];

        await deleteFolder(id);
        await loadFolders();

        // 返回受影响的文件夹 ID，供调用方清理表的 folderId
        return allFolderIds;
      } catch (err) {
        throw err instanceof Error ? err : new Error('删除文件夹失败');
      }
    },
    [loadFolders],
  );

  // 移动文件夹
  const handleMoveFolder = useCallback(
    async (id: string, newParentId?: string) => {
      try {
        await moveFolder(id, newParentId);
        await loadFolders();
      } catch (err) {
        throw err instanceof Error ? err : new Error('移动文件夹失败');
      }
    },
    [loadFolders],
  );

  return {
    folders: state.folders,
    folderTree: state.folderTree,
    loading: state.loading,
    error: state.error,
    refresh: loadFolders,
    createFolder: handleCreateFolder,
    renameFolder: handleRenameFolder,
    deleteFolder: handleDeleteFolder,
    moveFolder: handleMoveFolder,
  };
}
