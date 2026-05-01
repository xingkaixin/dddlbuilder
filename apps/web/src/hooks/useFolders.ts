import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useAuthSession } from '@/auth/AuthSessionProvider';
import { buildWorkspaceContentHash } from '@/services/workspaceIncrementalSyncService';
import { WORKSPACE_SNAPSHOT_APPLIED_EVENT } from '@/services/workspaceSyncService';
import { fireAndForget } from '@/hooks/workspacePersistence/storage';
import type { TableFolder } from '@/utils/savedTablesDb';
import {
  listFolders,
  createFolder,
  renameFolder,
  deleteFolder,
  moveFolder,
  buildFolderTree,
  getDescendantFolderIds,
  getFolder,
  type FolderTreeNode,
} from '@/utils/tableFolders';
import { getAnonymousWorkspaceScope, setCurrentWorkspaceScope } from '@/utils/workspaceScope';
import { enqueueWorkspaceOutboxItem } from '@/utils/workspaceSyncStateDb';
import type { WorkspaceScope } from '@ddlbuilder/shared-types/workspace';

export type { FolderTreeNode };

interface UseFoldersState {
  folders: TableFolder[];
  folderTree: FolderTreeNode[];
  loading: boolean;
  error: string | null;
}

export function useFolders() {
  const authSession = useAuthSession();
  const [state, setState] = useState<UseFoldersState>({
    folders: [],
    folderTree: [],
    loading: true,
    error: null,
  });
  const loadRequestRef = useRef(0);

  const currentScope = useMemo<WorkspaceScope | null>(() => {
    if (authSession.status === 'loading') {
      return null;
    }
    if (authSession.status === 'signed_in') {
      if (!authSession.userId || !authSession.workspaceId) {
        return null;
      }
      return {
        kind: 'user',
        userId: authSession.userId,
        workspaceId: authSession.workspaceId,
      };
    }
    return getAnonymousWorkspaceScope();
  }, [authSession.status, authSession.userId, authSession.workspaceId]);

  const queueFolderChange = useCallback(
    (input: { folder: TableFolder; op: 'upsert' } | { folderId: string; op: 'delete' }) => {
      if (!currentScope || currentScope.kind !== 'user' || !currentScope.workspaceId) return;
      const workspaceId = currentScope.workspaceId;
      fireAndForget(
        (async () => {
          const payload = input.op === 'upsert' ? input.folder : null;
          const entityId = input.op === 'upsert' ? input.folder.id : input.folderId;
          if (!entityId) return;
          await enqueueWorkspaceOutboxItem({
            workspaceId,
            entityType: 'folder',
            entityId,
            op: input.op,
            payload,
            contentHash: input.op === 'upsert' ? await buildWorkspaceContentHash(payload) : null,
          });
        })(),
      );
    },
    [currentScope],
  );

  // 加载文件夹列表
  const loadFolders = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    if (!currentScope) {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      return;
    }

    setCurrentWorkspaceScope(currentScope);
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const [folders, folderTree] = await Promise.all([
        listFolders(currentScope),
        buildFolderTree(currentScope),
      ]);
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
  }, [currentScope]);

  // 初始加载
  useEffect(() => {
    void loadFolders();
  }, [loadFolders]);

  useEffect(() => {
    const handleSnapshotApplied = () => {
      void loadFolders();
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
        const folder = await createFolder(name, parentId, currentScope);
        queueFolderChange({ op: 'upsert', folder });
        await loadFolders();
        return folder;
      } catch (err) {
        throw err instanceof Error ? err : new Error('创建文件夹失败');
      }
    },
    [currentScope, loadFolders, queueFolderChange],
  );

  // 重命名文件夹
  const handleRenameFolder = useCallback(
    async (id: string, newName: string) => {
      if (!currentScope) throw new Error('工作区未就绪');
      try {
        await renameFolder(id, newName, currentScope);
        const folder = await getFolder(id, currentScope);
        if (folder) {
          queueFolderChange({ op: 'upsert', folder });
        }
        await loadFolders();
      } catch (err) {
        throw err instanceof Error ? err : new Error('重命名文件夹失败');
      }
    },
    [currentScope, loadFolders, queueFolderChange],
  );

  // 删除文件夹
  const handleDeleteFolder = useCallback(
    async (id: string) => {
      if (!currentScope) throw new Error('工作区未就绪');
      try {
        // 获取所有受影响的文件夹 ID（包括子文件夹）
        const descendantIds = await getDescendantFolderIds(id, currentScope);
        const allFolderIds = [id, ...descendantIds];

        await deleteFolder(id, currentScope);
        for (const folderId of allFolderIds) {
          queueFolderChange({ op: 'delete', folderId });
        }
        await loadFolders();

        // 返回受影响的文件夹 ID，供调用方清理表的 folderId
        return allFolderIds;
      } catch (err) {
        throw err instanceof Error ? err : new Error('删除文件夹失败');
      }
    },
    [currentScope, loadFolders, queueFolderChange],
  );

  // 移动文件夹
  const handleMoveFolder = useCallback(
    async (id: string, newParentId?: string) => {
      if (!currentScope) throw new Error('工作区未就绪');
      try {
        await moveFolder(id, newParentId, currentScope);
        const folder = await getFolder(id, currentScope);
        if (folder) {
          queueFolderChange({ op: 'upsert', folder });
        }
        await loadFolders();
      } catch (err) {
        throw err instanceof Error ? err : new Error('移动文件夹失败');
      }
    },
    [currentScope, loadFolders, queueFolderChange],
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
