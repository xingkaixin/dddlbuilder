import { useCallback, useMemo, useState } from 'react';
import type { FolderTreeNode } from '@/hooks/useFolders';
import type {
  SaveTableResult,
  SavedTableSummary,
} from '@/hooks/useSavedTables';

interface UseFolderActionsParams {
  folderTree: FolderTreeNode[];
  savedTables: SavedTableSummary[];
  createFolder: (name: string, parentId?: string) => Promise<FolderTreeNode>;
  renameFolder: (id: string, name: string) => Promise<void>;
  deleteFolderAction: (id: string) => Promise<string[]>;
  clearTablesFromFolders: (folderIds: string[]) => Promise<void>;
  moveTableToFolder: (
    normalizedName: string,
    folderId?: string,
  ) => Promise<SaveTableResult>;
  showToast: (message: string) => void;
}

export function useFolderActions({
  folderTree,
  savedTables,
  createFolder,
  renameFolder,
  deleteFolderAction,
  clearTablesFromFolders,
  moveTableToFolder,
  showToast,
}: UseFolderActionsParams) {
  const [isFolderDialogOpen, setIsFolderDialogOpen] = useState(false);
  const [folderDialogMode, setFolderDialogMode] = useState<'create' | 'rename'>(
    'create',
  );
  const [folderDialogParent, setFolderDialogParent] =
    useState<FolderTreeNode | null>(null);
  const [folderDialogTarget, setFolderDialogTarget] =
    useState<FolderTreeNode | null>(null);

  const [isDeleteFolderDialogOpen, setIsDeleteFolderDialogOpen] =
    useState(false);
  const [deleteFolderTarget, setDeleteFolderTarget] =
    useState<FolderTreeNode | null>(null);

  const handleOpenCreateFolderDialog = useCallback(
    (parentId?: string) => {
      const parent = parentId
        ? (folderTree.find((folder) => folder.id === parentId) ?? null)
        : null;
      setFolderDialogParent(parent);
      setFolderDialogTarget(null);
      setFolderDialogMode('create');
      setIsFolderDialogOpen(true);
    },
    [folderTree],
  );

  const handleOpenRenameFolderDialog = useCallback((folder: FolderTreeNode) => {
    setFolderDialogParent(null);
    setFolderDialogTarget(folder);
    setFolderDialogMode('rename');
    setIsFolderDialogOpen(true);
  }, []);

  const handleOpenDeleteFolderDialog = useCallback((folder: FolderTreeNode) => {
    setDeleteFolderTarget(folder);
    setIsDeleteFolderDialogOpen(true);
  }, []);

  const handleFolderDialogConfirm = useCallback(
    async (name: string) => {
      if (folderDialogMode === 'create') {
        await createFolder(name, folderDialogParent?.id);
        showToast(`已创建文件夹：${name}`);
        return;
      }

      if (!folderDialogTarget) {
        return;
      }

      await renameFolder(folderDialogTarget.id, name);
      showToast(`已重命名为：${name}`);
    },
    [
      folderDialogMode,
      folderDialogParent,
      folderDialogTarget,
      createFolder,
      renameFolder,
      showToast,
    ],
  );

  const handleDeleteFolderConfirm = useCallback(async () => {
    if (!deleteFolderTarget) return;

    try {
      const affectedFolderIds = await deleteFolderAction(deleteFolderTarget.id);
      await clearTablesFromFolders(affectedFolderIds);
      showToast(`已删除文件夹：${deleteFolderTarget.name}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '删除失败');
    }
  }, [
    deleteFolderTarget,
    deleteFolderAction,
    clearTablesFromFolders,
    showToast,
  ]);

  const deleteFolderTableCount = useMemo(() => {
    if (!deleteFolderTarget) return 0;

    return savedTables.filter(
      (table) => table.folderId === deleteFolderTarget.id,
    ).length;
  }, [deleteFolderTarget, savedTables]);

  const handleMoveTableToFolder = useCallback(
    async (item: SavedTableSummary, folderId?: string) => {
      const result = await moveTableToFolder(item.normalizedName, folderId);
      if (result.ok) {
        showToast(folderId ? '已移动到文件夹' : '已移到未分组');
        return;
      }
      showToast(result.message ?? '移动失败');
    },
    [moveTableToFolder, showToast],
  );

  return {
    isFolderDialogOpen,
    setIsFolderDialogOpen,
    folderDialogMode,
    folderDialogParent,
    folderDialogTarget,
    isDeleteFolderDialogOpen,
    setIsDeleteFolderDialogOpen,
    deleteFolderTarget,
    deleteFolderTableCount,
    handleOpenCreateFolderDialog,
    handleOpenRenameFolderDialog,
    handleOpenDeleteFolderDialog,
    handleFolderDialogConfirm,
    handleDeleteFolderConfirm,
    handleMoveTableToFolder,
  };
}
