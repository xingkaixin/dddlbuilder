import { useCallback, useMemo, useState } from 'react';
import type { FolderTreeNode } from '@/hooks/useFolders';
import type { SaveTableResult, SavedTableSummary } from '@/hooks/useSavedTables';
import type { TableFolder } from '@/utils/savedTablesDb';
import i18n from '@/i18n';

interface UseFolderActionsParams {
  folderTree: FolderTreeNode[];
  savedTables: SavedTableSummary[];
  createFolder: (name: string, parentId?: string) => Promise<TableFolder>;
  renameFolder: (id: string, name: string) => Promise<void>;
  moveFolder: (id: string, parentId?: string) => Promise<void>;
  deleteFolderAction: (id: string) => Promise<string[]>;
  clearTablesFromFolders: (folderIds: string[]) => Promise<void>;
  deleteTable: (normalizedName: string) => Promise<SaveTableResult>;
  moveTableToFolder: (normalizedName: string, folderId?: string) => Promise<SaveTableResult>;
  showToast: (message: string) => void;
}

export function useFolderActions({
  folderTree,
  savedTables,
  createFolder,
  renameFolder,
  moveFolder,
  deleteFolderAction,
  clearTablesFromFolders,
  deleteTable,
  moveTableToFolder,
  showToast,
}: UseFolderActionsParams) {
  const [isFolderDialogOpen, setIsFolderDialogOpen] = useState(false);
  const [folderDialogMode, setFolderDialogMode] = useState<'create' | 'rename'>('create');
  const [folderDialogParent, setFolderDialogParent] = useState<FolderTreeNode | null>(null);
  const [folderDialogTarget, setFolderDialogTarget] = useState<FolderTreeNode | null>(null);

  const [isDeleteFolderDialogOpen, setIsDeleteFolderDialogOpen] = useState(false);
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<FolderTreeNode | null>(null);

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
        showToast(i18n.t('savedTables.toast.createdFolder', { name }));
        return;
      }

      if (!folderDialogTarget) {
        return;
      }

      await renameFolder(folderDialogTarget.id, name);
      showToast(i18n.t('savedTables.toast.renamedFolder', { name }));
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
      const collectFolderIds = (folder: FolderTreeNode): string[] => [
        folder.id,
        ...folder.children.flatMap(collectFolderIds),
      ];
      const affectedFolderIds = collectFolderIds(deleteFolderTarget);
      const affectedTables = savedTables.filter(
        (table) => table.folderId && affectedFolderIds.includes(table.folderId),
      );

      await clearTablesFromFolders(affectedFolderIds);
      await Promise.all(affectedTables.map((table) => deleteTable(table.normalizedName)));
      await deleteFolderAction(deleteFolderTarget.id);
      showToast(
        i18n.t('savedTables.toast.deletedFolder', {
          name: deleteFolderTarget.name,
        }),
      );
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : i18n.t('savedTables.toast.deleteFolderFailed'),
      );
    }
  }, [
    deleteFolderTarget,
    savedTables,
    clearTablesFromFolders,
    deleteTable,
    deleteFolderAction,
    showToast,
  ]);

  const deleteFolderTableCount = useMemo(() => {
    if (!deleteFolderTarget) return 0;
    const collectFolderIds = (folder: FolderTreeNode): string[] => [
      folder.id,
      ...folder.children.flatMap(collectFolderIds),
    ];
    const affectedFolderIds = collectFolderIds(deleteFolderTarget);

    return savedTables.filter(
      (table) => table.folderId && affectedFolderIds.includes(table.folderId),
    ).length;
  }, [deleteFolderTarget, savedTables]);

  const handleMoveTableToFolder = useCallback(
    async (item: SavedTableSummary, folderId?: string) => {
      const result = await moveTableToFolder(item.normalizedName, folderId);
      if (result.ok) {
        showToast(
          folderId
            ? i18n.t('savedTables.toast.movedToFolder')
            : i18n.t('savedTables.toast.movedToUngrouped'),
        );
        return { ok: true as const };
      }
      showToast(result.message ?? i18n.t('savedTables.toast.moveFailed'));
      return {
        ok: false as const,
        message: result.message ?? i18n.t('savedTables.toast.moveFailed'),
      };
    },
    [moveTableToFolder, showToast],
  );

  const handleMoveFolderToFolder = useCallback(
    async (folder: FolderTreeNode, parentId?: string) => {
      try {
        await moveFolder(folder.id, parentId);
        showToast(
          parentId
            ? i18n.t('savedTables.toast.movedFolder')
            : i18n.t('savedTables.toast.movedFolderToRoot'),
        );
        return { ok: true as const };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : i18n.t('savedTables.toast.moveFolderFailed');
        showToast(message);
        return { ok: false as const, message };
      }
    },
    [moveFolder, showToast],
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
    handleMoveFolderToFolder,
  };
}
