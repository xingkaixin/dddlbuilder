import { type SavedTableTarget } from '@ddlbuilder/shared-types/workspace';
import { useCallback, useMemo, useState } from 'react';
import type { FolderTreeNode } from '@/hooks/useFolders';
import type { SaveTableResult, SavedTableSummary } from '@/hooks/useSavedTables';
import type { TableFolder } from '@/utils/workspaceStorageTypes';
import type { WorkspaceDraftCatalog } from '@/hooks/usePersistedState';
import { useTabStore } from '@/stores';
import { findFolderTreeNode, getFolderTreeNodeIds } from '@/utils/folderModel';
import i18n from '@/i18n';

interface UseFolderActionsParams {
  folderTree: FolderTreeNode[];
  savedTables: SavedTableSummary[];
  drafts: Pick<WorkspaceDraftCatalog, 'draftSummaries' | 'getDraftState' | 'refreshDrafts'>;
  closeTab: (tabId: string) => void;
  createFolder: (name: string, parentId?: string) => Promise<TableFolder>;
  renameFolder: (id: string, name: string) => Promise<void>;
  moveFolder: (id: string, parentId?: string) => Promise<void>;
  deleteFolderAction: (id: string) => Promise<string[]>;
  moveTableToFolder: (
    normalizedName: SavedTableTarget,
    folderId?: string,
  ) => Promise<SaveTableResult>;
  showToast: (message: string) => void;
}

export function useFolderActions({
  folderTree,
  savedTables,
  drafts: { draftSummaries, getDraftState, refreshDrafts },
  closeTab,
  createFolder,
  renameFolder,
  moveFolder,
  deleteFolderAction,
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
      const parent = parentId ? findFolderTreeNode(folderTree, parentId) : null;
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
      const openDraftIds = new Set(
        useTabStore
          .getState()
          .tabs.filter((tab) => tab.source.kind === 'draft' && getDraftState(tab.source.draftId))
          .map((tab) => tab.id),
      );
      await deleteFolderAction(deleteFolderTarget.id);
      await refreshDrafts();
      const { tabs, activeTabId } = useTabStore.getState();
      const removedTabs = tabs.filter(
        (tab) =>
          openDraftIds.has(tab.id) &&
          tab.source.kind === 'draft' &&
          !getDraftState(tab.source.draftId),
      );
      // 先移除后台标签，避免活动标签切换到即将删除的草稿。
      for (const tab of removedTabs) {
        if (tab.id !== activeTabId) closeTab(tab.id);
      }
      if (activeTabId && removedTabs.some((tab) => tab.id === activeTabId)) closeTab(activeTabId);
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
  }, [closeTab, deleteFolderTarget, deleteFolderAction, getDraftState, refreshDrafts, showToast]);

  const deleteFolderTableCount = useMemo(() => {
    if (!deleteFolderTarget) return 0;
    const affectedFolderIds = new Set(getFolderTreeNodeIds(deleteFolderTarget));

    return [...savedTables, ...draftSummaries].filter(
      (item) => item.folderId && affectedFolderIds.has(item.folderId),
    ).length;
  }, [deleteFolderTarget, draftSummaries, savedTables]);

  const handleMoveTableToFolder = useCallback(
    async (item: SavedTableSummary, folderId?: string) => {
      const result = await moveTableToFolder(item, folderId);
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
