import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import type * as Y from 'yjs';
import {
  buildFolderTreeFromYDoc,
  deleteFolderFromYDoc,
  listSavedTableRecordsFromYDoc,
  listFoldersFromYDoc,
  upsertSavedTableInYDoc,
  upsertFolderInYDoc,
} from '@/services/workspaceYDocAdapter';
import type { TableFolder } from '@/utils/workspaceStorageTypes';
import {
  createFolder,
  deleteFolder,
  moveFolder,
  renameFolder,
  type FolderTreeNode,
} from '@/utils/tableFolders';
import { useWorkspaceAuthority } from '@/hooks/workspacePersistence/useWorkspaceAuthority';
import { useWorkspaceYDocProjection } from '@/hooks/useWorkspaceYDocProjection';
import { localFoldersOptions } from '@/queries/workspaceLocal';
import {
  buildFolderDeletionPlan,
  createFolderRecord,
  moveFolderRecord,
  renameFolderRecord,
} from '@/utils/folderModel';

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
  const { scope: currentScope, yDoc, yDocReady, storage, refresh } = useWorkspaceAuthority();
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
        const folder = await storage.update({
          yDoc: (doc) => {
            const nextFolder = createFolderRecord(yDocProjection.folders, name, parentId);
            upsertFolderInYDoc(doc, nextFolder);
            return nextFolder;
          },
          local: (scope) => createFolder(name, scope, parentId),
        });
        await refresh();
        return folder;
      } catch (error) {
        throw error instanceof Error ? error : new Error('创建文件夹失败');
      }
    },
    [refresh, storage, yDocProjection.folders],
  );

  const handleRenameFolder = useCallback(
    async (id: string, newName: string) => {
      try {
        await storage.update({
          yDoc: (doc) => {
            const folder = yDocProjection.folders.find((item) => item.id === id);
            if (!folder) throw new Error('文件夹不存在');
            upsertFolderInYDoc(doc, renameFolderRecord(folder, newName));
          },
          local: (scope) => renameFolder(id, newName, scope),
        });
        await refresh();
      } catch (error) {
        throw error instanceof Error ? error : new Error('重命名文件夹失败');
      }
    },
    [refresh, storage, yDocProjection.folders],
  );

  const handleDeleteFolder = useCallback(
    async (id: string) => {
      try {
        const allFolderIds = await storage.update({
          yDoc: (doc) => {
            const plan = buildFolderDeletionPlan(
              listFoldersFromYDoc(doc),
              listSavedTableRecordsFromYDoc(doc),
              id,
            );
            for (const table of plan.tablesToTrash) upsertSavedTableInYDoc(doc, table);
            for (const folderId of plan.folderIds) deleteFolderFromYDoc(doc, folderId);
            return plan.folderIds;
          },
          local: (scope) => deleteFolder(id, scope),
        });
        await refresh();
        return allFolderIds;
      } catch (error) {
        console.error('[folders] atomic deletion failed', {
          folderId: id,
          storage: storage.kind,
          error,
        });
        throw error instanceof Error ? error : new Error('删除文件夹失败');
      }
    },
    [refresh, storage],
  );

  const handleMoveFolder = useCallback(
    async (id: string, newParentId?: string) => {
      try {
        await storage.update({
          yDoc: (doc) => {
            const nextFolder = moveFolderRecord(yDocProjection.folders, id, newParentId);
            upsertFolderInYDoc(doc, nextFolder);
          },
          local: (scope) => moveFolder(id, scope, newParentId),
        });
        await refresh();
      } catch (error) {
        throw error instanceof Error ? error : new Error('移动文件夹失败');
      }
    },
    [refresh, storage, yDocProjection.folders],
  );

  return {
    folders: projection?.folders ?? [],
    folderTree: projection?.folderTree ?? [],
    loading: !currentScope || (!yDocReady && localFoldersQuery.isPending),
    error:
      !yDocReady && localFoldersQuery.error
        ? localFoldersQuery.error instanceof Error
          ? localFoldersQuery.error.message
          : '加载文件夹失败'
        : null,
    refresh,
    createFolder: handleCreateFolder,
    renameFolder: handleRenameFolder,
    deleteFolder: handleDeleteFolder,
    moveFolder: handleMoveFolder,
  };
}
