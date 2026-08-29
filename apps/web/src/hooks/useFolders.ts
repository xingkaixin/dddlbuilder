import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type * as Y from 'yjs';
import { buildFolderTreeFromYDoc, listFoldersFromYDoc } from '@/services/workspaceYDocAdapter';
import type { TableFolder } from '@/utils/workspaceStorageTypes';
import { type FolderTreeNode } from '@/utils/tableFolders';
import { useWorkspaceYDocProjection } from '@/hooks/useWorkspaceYDocProjection';
import { localFoldersOptions } from '@/queries/workspaceLocal';
import { useFolderPersistence } from '@/hooks/workspacePersistence/useFolderPersistence';

export type { FolderTreeNode };

const FOLDER_COLLECTIONS = ['folders'] as const;
const EMPTY_FOLDER_PROJECTION: { folders: TableFolder[]; folderTree: FolderTreeNode[] } = {
  folders: [],
  folderTree: [],
};

const readFolderProjection = (doc: Y.Doc) => ({
  folders: listFoldersFromYDoc(doc),
  folderTree: buildFolderTreeFromYDoc(doc),
});

export function useFolders() {
  const { t } = useTranslation();
  const {
    scope: currentScope,
    yDoc,
    yDocReady,
    storage,
    refresh,
    createFolderEntry,
    renameFolderEntry,
    deleteFolderTree,
    moveFolderEntry,
  } = useFolderPersistence();
  const yDocProjection = useWorkspaceYDocProjection(
    yDoc,
    FOLDER_COLLECTIONS,
    readFolderProjection,
    EMPTY_FOLDER_PROJECTION,
  );
  const localFoldersQuery = useQuery({
    ...localFoldersOptions(currentScope),
    enabled: Boolean(currentScope && !yDocReady),
  });
  const projection = yDocReady ? yDocProjection : localFoldersQuery.data;

  const handleCreateFolder = useCallback(
    async (name: string, parentId?: string) => {
      try {
        const folder = await createFolderEntry(name, parentId);
        await refresh();
        return folder;
      } catch (error) {
        throw error instanceof Error ? error : new Error(t('savedTables.toast.createFolderFailed'));
      }
    },
    [createFolderEntry, refresh, t],
  );

  const handleRenameFolder = useCallback(
    async (id: string, newName: string) => {
      try {
        await renameFolderEntry(id, newName);
        await refresh();
      } catch (error) {
        throw error instanceof Error ? error : new Error(t('savedTables.toast.renameFolderFailed'));
      }
    },
    [refresh, renameFolderEntry, t],
  );

  const handleDeleteFolder = useCallback(
    async (id: string) => {
      try {
        const allFolderIds = await deleteFolderTree(id);
        await refresh();
        return allFolderIds;
      } catch (error) {
        console.error('[folders] atomic deletion failed', {
          folderId: id,
          storage: storage.kind,
          error,
        });
        throw error instanceof Error ? error : new Error(t('savedTables.toast.deleteFailed'));
      }
    },
    [deleteFolderTree, refresh, storage.kind, t],
  );

  const handleMoveFolder = useCallback(
    async (id: string, newParentId?: string) => {
      try {
        await moveFolderEntry(id, newParentId);
        await refresh();
      } catch (error) {
        throw error instanceof Error ? error : new Error(t('savedTables.toast.moveFolderFailed'));
      }
    },
    [moveFolderEntry, refresh, t],
  );

  return {
    folders: projection?.folders ?? [],
    folderTree: projection?.folderTree ?? [],
    loading: !currentScope || (!yDocReady && localFoldersQuery.isPending),
    error:
      !yDocReady && localFoldersQuery.error
        ? localFoldersQuery.error instanceof Error
          ? localFoldersQuery.error.message
          : t('savedTables.toast.folderLoadFailed')
        : null,
    refresh,
    createFolder: handleCreateFolder,
    renameFolder: handleRenameFolder,
    deleteFolder: handleDeleteFolder,
    moveFolder: handleMoveFolder,
  };
}
