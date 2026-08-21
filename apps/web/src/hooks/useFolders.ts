import { useState, useCallback, useEffect, useRef } from 'react';
import type * as Y from 'yjs';
import { useWorkspaceYDoc } from '@/providers/WorkspaceYDocProvider';
import { WORKSPACE_SNAPSHOT_APPLIED_EVENT } from '@/services/workspaceSyncService';
import {
  buildFolderTreeFromYDoc,
  deleteFolderFromYDoc,
  listFoldersFromYDoc,
  subscribeWorkspaceYDoc,
  upsertFolderInYDoc,
} from '@/services/workspaceYDocAdapter';
import type { TableFolder } from '@/utils/savedTablesDb';
import {
  listFolders,
  createFolder,
  renameFolder,
  deleteFolder,
  moveFolder,
  updateFolder,
  buildFolderTree,
  getDescendantFolderIds,
  getFolder,
  type FolderTreeNode,
} from '@/utils/tableFolders';
import { useWorkspaceScope } from '@/hooks/useWorkspaceScope';

export type { FolderTreeNode };

interface UseFoldersState {
  folders: TableFolder[];
  folderTree: FolderTreeNode[];
  loading: boolean;
  error: string | null;
}

export function useFolders() {
  const workspaceYDoc = useWorkspaceYDoc();
  const [state, setState] = useState<UseFoldersState>({
    folders: [],
    folderTree: [],
    loading: true,
    error: null,
  });
  const loadRequestRef = useRef(0);

  const currentScope = useWorkspaceScope();
  const yDocReady = Boolean(
    workspaceYDoc.doc &&
    workspaceYDoc.localSynced &&
    currentScope?.kind === 'user' &&
    currentScope.workspaceId,
  );

  const runInYDoc = useCallback(
    (mutate: (doc: Y.Doc) => void) => {
      if (!yDocReady || !workspaceYDoc.doc) return;
      const doc = workspaceYDoc.doc;
      doc.transact(() => mutate(doc));
    },
    [workspaceYDoc.doc, yDocReady],
  );

  // 加载文件夹列表
  const loadFolders = useCallback(
    async (options?: { showLoading?: boolean }) => {
      const requestId = ++loadRequestRef.current;
      if (!currentScope) {
        setState((prev) => ({ ...prev, loading: true, error: null }));
        return;
      }

      if (options?.showLoading !== false) {
        setState((prev) => ({ ...prev, loading: true, error: null }));
      }
      try {
        const [folders, folderTree] =
          yDocReady && workspaceYDoc.doc
            ? [listFoldersFromYDoc(workspaceYDoc.doc), buildFolderTreeFromYDoc(workspaceYDoc.doc)]
            : await Promise.all([listFolders(currentScope), buildFolderTree(currentScope)]);
        if (loadRequestRef.current !== requestId) return;
        setState({
          folders,
          folderTree,
          loading: false,
          error: null,
        });
      } catch (err) {
        if (loadRequestRef.current !== requestId) return;
        setState((prev) => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : '加载文件夹失败',
        }));
      }
    },
    [currentScope, workspaceYDoc.doc, yDocReady],
  );

  // 初始加载
  useEffect(() => {
    void loadFolders();
  }, [loadFolders]);

  useEffect(() => {
    if (!yDocReady || !workspaceYDoc.doc) return;
    return subscribeWorkspaceYDoc(
      workspaceYDoc.doc,
      () => {
        void loadFolders({ showLoading: false });
      },
      ['folders'],
    );
  }, [loadFolders, workspaceYDoc.doc, yDocReady]);

  useEffect(() => {
    const handleSnapshotApplied = () => {
      void loadFolders({ showLoading: false });
    };

    window.addEventListener(WORKSPACE_SNAPSHOT_APPLIED_EVENT, handleSnapshotApplied);
    return () => {
      window.removeEventListener(WORKSPACE_SNAPSHOT_APPLIED_EVENT, handleSnapshotApplied);
    };
  }, [loadFolders]);

  // 创建文件夹
  const handleCreateFolder = useCallback(
    async (name: string, parentId?: string) => {
      if (!currentScope) throw new Error('工作区未就绪');
      try {
        const folder = await createFolder(name, currentScope, parentId);
        runInYDoc((doc) => upsertFolderInYDoc(doc, folder));
        await loadFolders();
        return folder;
      } catch (err) {
        throw err instanceof Error ? err : new Error('创建文件夹失败');
      }
    },
    [currentScope, loadFolders, runInYDoc],
  );

  // 重命名文件夹
  const handleRenameFolder = useCallback(
    async (id: string, newName: string) => {
      if (!currentScope) throw new Error('工作区未就绪');
      try {
        if (!yDocReady || !workspaceYDoc.doc) {
          await renameFolder(id, newName, currentScope);
          await loadFolders();
          return;
        }

        const folder =
          listFoldersFromYDoc(workspaceYDoc.doc).find((item) => item.id === id) ??
          (await getFolder(id, currentScope));
        if (!folder) {
          throw new Error('文件夹不存在');
        }
        const nextFolder = { ...folder, name: newName.trim() };
        await updateFolder(nextFolder, currentScope);
        runInYDoc((doc) => upsertFolderInYDoc(doc, nextFolder));
        await loadFolders();
      } catch (err) {
        throw err instanceof Error ? err : new Error('重命名文件夹失败');
      }
    },
    [currentScope, loadFolders, runInYDoc, workspaceYDoc.doc, yDocReady],
  );

  // 删除文件夹
  const handleDeleteFolder = useCallback(
    async (id: string) => {
      if (!currentScope) throw new Error('工作区未就绪');
      try {
        const descendantIds =
          yDocReady && workspaceYDoc.doc
            ? (() => {
                const folders = listFoldersFromYDoc(workspaceYDoc.doc);
                const result: string[] = [];
                const collect = (parentId: string) => {
                  for (const folder of folders) {
                    if (folder.parentId === parentId) {
                      result.push(folder.id);
                      collect(folder.id);
                    }
                  }
                };
                collect(id);
                return result;
              })()
            : await getDescendantFolderIds(id, currentScope);
        const allFolderIds = [id, ...descendantIds];

        await deleteFolder(id, currentScope);
        for (const folderId of allFolderIds) {
          runInYDoc((doc) => deleteFolderFromYDoc(doc, folderId));
        }
        await loadFolders();

        // 返回受影响的文件夹 ID，供调用方清理表的 folderId
        return allFolderIds;
      } catch (err) {
        throw err instanceof Error ? err : new Error('删除文件夹失败');
      }
    },
    [currentScope, loadFolders, runInYDoc, workspaceYDoc.doc, yDocReady],
  );

  // 移动文件夹
  const handleMoveFolder = useCallback(
    async (id: string, newParentId?: string) => {
      if (!currentScope) throw new Error('工作区未就绪');
      try {
        if (!yDocReady || !workspaceYDoc.doc) {
          await moveFolder(id, currentScope, newParentId);
          await loadFolders();
          return;
        }

        const folder =
          listFoldersFromYDoc(workspaceYDoc.doc).find((item) => item.id === id) ??
          (await getFolder(id, currentScope));
        if (!folder) {
          throw new Error('文件夹不存在');
        }
        const siblings = listFoldersFromYDoc(workspaceYDoc.doc).filter(
          (item) => item.parentId === newParentId && item.id !== id,
        );
        const maxOrder = siblings.reduce((max, item) => Math.max(max, item.order), 0);
        const nextFolder = { ...folder, parentId: newParentId, order: maxOrder + 1 };
        await updateFolder(nextFolder, currentScope);
        runInYDoc((doc) => upsertFolderInYDoc(doc, nextFolder));
        await loadFolders();
      } catch (err) {
        throw err instanceof Error ? err : new Error('移动文件夹失败');
      }
    },
    [currentScope, loadFolders, runInYDoc, workspaceYDoc.doc, yDocReady],
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
