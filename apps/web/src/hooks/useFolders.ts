import { useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type * as Y from 'yjs';
import { useWorkspaceYDoc } from '@/providers/WorkspaceYDocProvider';
import { WORKSPACE_SNAPSHOT_APPLIED_EVENT } from '@/services/workspaceSyncService';
import {
  buildFolderTreeFromYDoc,
  deleteFolderFromYDoc,
  listFoldersFromYDoc,
  upsertFolderInYDoc,
} from '@/services/workspaceYDocAdapter';
import type { TableFolder } from '@/utils/savedTablesDb';
import {
  createFolder,
  deleteFolder,
  getDescendantFolderIds,
  getFolder,
  moveFolder,
  renameFolder,
  updateFolder,
  type FolderTreeNode,
} from '@/utils/tableFolders';
import { useWorkspaceScope } from '@/hooks/useWorkspaceScope';
import { useWorkspaceYDocProjection } from '@/hooks/useWorkspaceYDocProjection';
import { localFoldersOptions, workspaceLocalQueryKeys } from '@/queries/workspaceLocal';

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

const descendantFolderIds = (folders: TableFolder[], parentId: string) => {
  const result: string[] = [];
  const collect = (currentParentId: string) => {
    for (const folder of folders) {
      if (folder.parentId !== currentParentId) continue;
      result.push(folder.id);
      collect(folder.id);
    }
  };
  collect(parentId);
  return result;
};

export function useFolders() {
  const workspaceYDoc = useWorkspaceYDoc();
  const currentScope = useWorkspaceScope();
  const queryClient = useQueryClient();
  const yDocReady = Boolean(
    workspaceYDoc.doc &&
    workspaceYDoc.localSynced &&
    currentScope?.kind === 'user' &&
    currentScope.workspaceId,
  );
  const yDocProjection = useWorkspaceYDocProjection(
    yDocReady ? workspaceYDoc.doc : null,
    FOLDER_COLLECTIONS,
    readFolderProjection,
    EMPTY_FOLDER_PROJECTION,
  );
  const localFoldersQuery = useQuery({
    ...localFoldersOptions(currentScope),
    enabled: Boolean(currentScope && !yDocReady),
  });
  const projection = yDocReady ? yDocProjection : localFoldersQuery.data;

  const refresh = useCallback(async () => {
    if (!currentScope) return;
    await queryClient.invalidateQueries({
      queryKey: workspaceLocalQueryKeys.scope(currentScope),
    });
  }, [currentScope, queryClient]);

  const runInYDoc = useCallback(
    (mutate: (doc: Y.Doc) => void) => {
      if (!yDocReady || !workspaceYDoc.doc) return;
      const doc = workspaceYDoc.doc;
      doc.transact(() => mutate(doc));
    },
    [workspaceYDoc.doc, yDocReady],
  );

  useEffect(() => {
    const handleSnapshotApplied = () => void refresh();
    window.addEventListener(WORKSPACE_SNAPSHOT_APPLIED_EVENT, handleSnapshotApplied);
    return () =>
      window.removeEventListener(WORKSPACE_SNAPSHOT_APPLIED_EVENT, handleSnapshotApplied);
  }, [refresh]);

  const handleCreateFolder = useCallback(
    async (name: string, parentId?: string) => {
      if (!currentScope) throw new Error('工作区未就绪');
      try {
        const folder = await createFolder(name, currentScope, parentId);
        runInYDoc((doc) => upsertFolderInYDoc(doc, folder));
        await refresh();
        return folder;
      } catch (error) {
        throw error instanceof Error ? error : new Error('创建文件夹失败');
      }
    },
    [currentScope, refresh, runInYDoc],
  );

  const handleRenameFolder = useCallback(
    async (id: string, newName: string) => {
      if (!currentScope) throw new Error('工作区未就绪');
      try {
        if (!yDocReady || !workspaceYDoc.doc) {
          await renameFolder(id, newName, currentScope);
          await refresh();
          return;
        }

        const folder =
          yDocProjection.folders.find((item) => item.id === id) ??
          (await getFolder(id, currentScope));
        if (!folder) throw new Error('文件夹不存在');
        const nextFolder = { ...folder, name: newName.trim() };
        await updateFolder(nextFolder, currentScope);
        runInYDoc((doc) => upsertFolderInYDoc(doc, nextFolder));
      } catch (error) {
        throw error instanceof Error ? error : new Error('重命名文件夹失败');
      }
    },
    [currentScope, refresh, runInYDoc, workspaceYDoc.doc, yDocProjection.folders, yDocReady],
  );

  const handleDeleteFolder = useCallback(
    async (id: string) => {
      if (!currentScope) throw new Error('工作区未就绪');
      try {
        const descendantIds = yDocReady
          ? descendantFolderIds(yDocProjection.folders, id)
          : await getDescendantFolderIds(id, currentScope);
        const allFolderIds = [id, ...descendantIds];

        await deleteFolder(id, currentScope);
        runInYDoc((doc) => {
          for (const folderId of allFolderIds) deleteFolderFromYDoc(doc, folderId);
        });
        await refresh();
        return allFolderIds;
      } catch (error) {
        throw error instanceof Error ? error : new Error('删除文件夹失败');
      }
    },
    [currentScope, refresh, runInYDoc, yDocProjection.folders, yDocReady],
  );

  const handleMoveFolder = useCallback(
    async (id: string, newParentId?: string) => {
      if (!currentScope) throw new Error('工作区未就绪');
      try {
        if (!yDocReady || !workspaceYDoc.doc) {
          await moveFolder(id, currentScope, newParentId);
          await refresh();
          return;
        }

        const folder =
          yDocProjection.folders.find((item) => item.id === id) ??
          (await getFolder(id, currentScope));
        if (!folder) throw new Error('文件夹不存在');
        const maxOrder = yDocProjection.folders
          .filter((item) => item.parentId === newParentId && item.id !== id)
          .reduce((max, item) => Math.max(max, item.order), 0);
        const nextFolder = { ...folder, parentId: newParentId, order: maxOrder + 1 };
        await updateFolder(nextFolder, currentScope);
        runInYDoc((doc) => upsertFolderInYDoc(doc, nextFolder));
      } catch (error) {
        throw error instanceof Error ? error : new Error('移动文件夹失败');
      }
    },
    [currentScope, refresh, runInYDoc, workspaceYDoc.doc, yDocProjection.folders, yDocReady],
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
