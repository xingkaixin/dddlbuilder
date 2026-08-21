import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type * as Y from 'yjs';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { useAuthSession } from '@/auth/AuthSessionProvider';
import { useWorkspaceYDoc } from '@/providers/WorkspaceYDocProvider';
import { WORKSPACE_SNAPSHOT_APPLIED_EVENT } from '@/services/workspaceSyncService';
import { invalidateLegacyWorkspaceMigration } from '@/services/workspaceLegacyMigrationMarker';
import {
  deleteSavedTableFromYDoc,
  getSavedTableFromYDoc,
  listSavedTableMetadataFromYDoc,
  subscribeWorkspaceYDoc,
  upsertSavedTableInYDoc,
} from '@/services/workspaceYDocAdapter';
import type { WorkspaceScope } from '@ddlbuilder/shared-types/workspace';
import {
  addSavedTable,
  deleteSavedTable,
  ensureSavedTableName,
  getSavedTable,
  listSavedTableMetadata,
  listTrashedSavedTableMetadata,
  moveSavedTableToTrash,
  normalizeSavedTableName,
  updateSavedTable,
  updateSavedTables,
  type SavedTableMetadata,
  type SavedTableRecord,
} from '@/utils/savedTablesDb';
import { getAnonymousWorkspaceScope, setCurrentWorkspaceScope } from '@/utils/workspaceScope';

export type SavedTableSummary = SavedTableMetadata;

export type SaveTableResult =
  | { ok: true; normalizedName: string }
  | {
      ok: false;
      reason: 'duplicate' | 'not_found' | 'error';
      message?: string;
    };

const sortSavedTablesByCreatedAt = (tables: SavedTableSummary[]) =>
  [...tables].sort(
    (a, b) => b.createdAt - a.createdAt || a.normalizedName.localeCompare(b.normalizedName),
  );

export function useSavedTables() {
  const authSession = useAuthSession();
  const workspaceYDoc = useWorkspaceYDoc();
  const [savedTables, setSavedTables] = useState<SavedTableSummary[]>([]);
  const [trashedTables, setTrashedTables] = useState<SavedTableSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refreshRequestRef = useRef(0);

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
  const yDocReady = Boolean(
    workspaceYDoc.doc &&
    workspaceYDoc.localSynced &&
    currentScope?.kind === 'user' &&
    currentScope.workspaceId,
  );

  const runInYDoc = useCallback(
    (mutate: (doc: Y.Doc) => void) => {
      if (yDocReady && workspaceYDoc.doc) {
        const doc = workspaceYDoc.doc;
        doc.transact(() => mutate(doc));
        return;
      }
      // Y.Doc 还不可写（分享页在本地加载完成前仍然放行「另存为副本」），这次改动只落在本地
      // 分区。legacy 迁移的一次性标记会让它永远留在那里，所以按既有契约重开迁移：谁写了本地
      // 分区，谁负责让下次启动把它带进 Y.Doc。
      if (currentScope?.kind === 'user' && currentScope.workspaceId) {
        invalidateLegacyWorkspaceMigration(currentScope);
      }
    },
    [currentScope, workspaceYDoc.doc, yDocReady],
  );

  const refresh = useCallback(
    async (options?: { showLoading?: boolean }) => {
      const requestId = ++refreshRequestRef.current;
      if (!currentScope) {
        setLoading(true);
        return;
      }

      setCurrentWorkspaceScope(currentScope);
      try {
        if (options?.showLoading !== false) {
          setLoading(true);
        }
        const [metadata, trashedMetadata] =
          yDocReady && workspaceYDoc.doc
            ? [
                listSavedTableMetadataFromYDoc(workspaceYDoc.doc),
                await listTrashedSavedTableMetadata(currentScope),
              ]
            : await Promise.all([
                listSavedTableMetadata(currentScope),
                listTrashedSavedTableMetadata(currentScope),
              ]);
        if (refreshRequestRef.current !== requestId) return;
        const sorted = sortSavedTablesByCreatedAt(metadata);
        const sortedTrashed = trashedMetadata.sort(
          (a, b) => (b.trashedAt ?? 0) - (a.trashedAt ?? 0),
        );
        setSavedTables(sorted);
        setTrashedTables(sortedTrashed);
        setError(null);
      } catch (err) {
        if (refreshRequestRef.current !== requestId) return;
        setError(err instanceof Error ? err.message : '读取失败');
      } finally {
        if (refreshRequestRef.current === requestId) {
          setLoading(false);
        }
      }
    },
    [currentScope, workspaceYDoc.doc, yDocReady],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!yDocReady || !workspaceYDoc.doc) return;
    return subscribeWorkspaceYDoc(
      workspaceYDoc.doc,
      () => {
        void refresh({ showLoading: false });
      },
      ['savedTables'],
    );
  }, [refresh, workspaceYDoc.doc, yDocReady]);

  useEffect(() => {
    const handleSnapshotApplied = () => {
      void refresh({ showLoading: false });
    };

    window.addEventListener(WORKSPACE_SNAPSHOT_APPLIED_EVENT, handleSnapshotApplied);
    return () => {
      window.removeEventListener(WORKSPACE_SNAPSHOT_APPLIED_EVENT, handleSnapshotApplied);
    };
  }, [refresh]);

  const saveTable = useCallback(
    async (name: string, state: PersistedState): Promise<SaveTableResult> => {
      try {
        const displayName = ensureSavedTableName(name);
        const normalizedName = normalizeSavedTableName(displayName);
        const existing =
          yDocReady && workspaceYDoc.doc
            ? getSavedTableFromYDoc(workspaceYDoc.doc, normalizedName)
            : await getSavedTable(normalizedName);
        if (existing && !existing.trashedAt) {
          return { ok: false, reason: 'duplicate' };
        }
        const now = Date.now();
        if (existing?.trashedAt) {
          await updateSavedTable({
            ...existing,
            name: displayName,
            state,
            trashedAt: undefined,
            updatedAt: now,
          });
        } else {
          await addSavedTable({
            normalizedName,
            name: displayName,
            state,
            createdAt: now,
            updatedAt: now,
          });
        }
        runInYDoc((doc) =>
          upsertSavedTableInYDoc(doc, {
            normalizedName,
            name: displayName,
            state,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
          }),
        );
        await refresh();
        return { ok: true, normalizedName };
      } catch (err) {
        return {
          ok: false,
          reason: 'error',
          message: err instanceof Error ? err.message : '保存失败',
        };
      }
    },
    [refresh, runInYDoc, workspaceYDoc.doc, yDocReady],
  );

  const overwriteTable = useCallback(
    async (normalizedName: string, state: PersistedState): Promise<SaveTableResult> => {
      try {
        const record =
          yDocReady && workspaceYDoc.doc
            ? getSavedTableFromYDoc(workspaceYDoc.doc, normalizedName)
            : await getSavedTable(normalizedName);
        if (!record) {
          return { ok: false, reason: 'not_found' };
        }
        const updatedRecord: SavedTableRecord = {
          ...record,
          state,
          updatedAt: Date.now(),
        };
        await updateSavedTable(updatedRecord);
        runInYDoc((doc) => upsertSavedTableInYDoc(doc, updatedRecord));
        await refresh();
        return { ok: true, normalizedName };
      } catch (err) {
        return {
          ok: false,
          reason: 'error',
          message: err instanceof Error ? err.message : '更新失败',
        };
      }
    },
    [refresh, runInYDoc, workspaceYDoc.doc, yDocReady],
  );

  const deleteTable = useCallback(
    async (normalizedName: string): Promise<SaveTableResult> => {
      try {
        await moveSavedTableToTrash(normalizedName);
        runInYDoc((doc) => deleteSavedTableFromYDoc(doc, normalizedName));
        await refresh();
        return { ok: true, normalizedName };
      } catch (err) {
        return {
          ok: false,
          reason: 'error',
          message: err instanceof Error ? err.message : '删除失败',
        };
      }
    },
    [refresh, runInYDoc],
  );

  const restoreTable = useCallback(
    async (
      normalizedName: string,
      options?: { existingFolderIds?: Set<string> },
    ): Promise<SaveTableResult> => {
      try {
        const record = await getSavedTable(normalizedName);
        if (!record) {
          return { ok: false, reason: 'not_found' };
        }

        // 命名冲突解决
        const existingNormalizedNames = new Set(savedTables.map((t) => t.normalizedName));
        let targetNormalizedName = normalizedName;
        let targetName = record.name;

        if (existingNormalizedNames.has(normalizedName)) {
          let counter = 1;
          const baseName = record.name;
          const baseNormalized = normalizeSavedTableName(baseName);
          while (existingNormalizedNames.has(`${baseNormalized}_${counter}`)) {
            counter++;
          }
          targetNormalizedName = `${baseNormalized}_${counter}`;
          targetName = `${baseName}_${counter}`;
        }

        // 文件夹回退：原文件夹不存在则恢复到根目录
        const folderId =
          record.folderId && options?.existingFolderIds?.has(record.folderId)
            ? record.folderId
            : undefined;

        const restoredRecord: SavedTableRecord = {
          ...record,
          normalizedName: targetNormalizedName,
          name: targetName,
          folderId,
          trashedAt: undefined,
          updatedAt: Date.now(),
        };

        if (targetNormalizedName !== normalizedName) {
          await addSavedTable(restoredRecord);
          await deleteSavedTable(normalizedName);
        } else {
          await updateSavedTable(restoredRecord);
        }

        runInYDoc((doc) => upsertSavedTableInYDoc(doc, restoredRecord));
        if (targetNormalizedName !== normalizedName) {
          runInYDoc((doc) => deleteSavedTableFromYDoc(doc, normalizedName));
        }
        await refresh();
        return { ok: true, normalizedName: targetNormalizedName };
      } catch (err) {
        return {
          ok: false,
          reason: 'error',
          message: err instanceof Error ? err.message : '恢复失败',
        };
      }
    },
    [refresh, runInYDoc, savedTables],
  );

  const deleteTablePermanently = useCallback(
    async (normalizedName: string): Promise<SaveTableResult> => {
      try {
        await deleteSavedTable(normalizedName);
        runInYDoc((doc) => deleteSavedTableFromYDoc(doc, normalizedName));
        await refresh();
        return { ok: true, normalizedName };
      } catch (err) {
        return {
          ok: false,
          reason: 'error',
          message: err instanceof Error ? err.message : '删除失败',
        };
      }
    },
    [refresh, runInYDoc],
  );

  const renameTable = useCallback(
    async (normalizedName: string, newName: string): Promise<SaveTableResult> => {
      try {
        const record =
          yDocReady && workspaceYDoc.doc
            ? getSavedTableFromYDoc(workspaceYDoc.doc, normalizedName)
            : await getSavedTable(normalizedName);
        if (!record) {
          return { ok: false, reason: 'not_found' };
        }
        const displayName = ensureSavedTableName(newName);
        const nextNormalizedName = normalizeSavedTableName(displayName);
        const existing =
          yDocReady && workspaceYDoc.doc
            ? getSavedTableFromYDoc(workspaceYDoc.doc, nextNormalizedName)
            : await getSavedTable(nextNormalizedName);
        if (existing && existing.normalizedName !== normalizedName) {
          return { ok: false, reason: 'duplicate' };
        }
        const updatedRecord: SavedTableRecord = {
          ...record,
          name: displayName,
          normalizedName: nextNormalizedName,
          updatedAt: Date.now(),
        };
        if (nextNormalizedName === normalizedName) {
          await updateSavedTable(updatedRecord);
        } else {
          await addSavedTable(updatedRecord);
          await deleteSavedTable(normalizedName);
        }
        runInYDoc((doc) => {
          upsertSavedTableInYDoc(doc, updatedRecord);
          if (nextNormalizedName !== normalizedName) {
            deleteSavedTableFromYDoc(doc, normalizedName);
          }
        });
        await refresh();
        return { ok: true, normalizedName: nextNormalizedName };
      } catch (err) {
        return {
          ok: false,
          reason: 'error',
          message: err instanceof Error ? err.message : '重命名失败',
        };
      }
    },
    [refresh, runInYDoc, workspaceYDoc.doc, yDocReady],
  );

  const loadTable = useCallback(
    async (normalizedName: string) => {
      if (yDocReady && workspaceYDoc.doc) {
        return getSavedTableFromYDoc(workspaceYDoc.doc, normalizedName);
      }
      return getSavedTable(normalizedName);
    },
    [workspaceYDoc.doc, yDocReady],
  );

  // 移动表到指定文件夹
  const moveTableToFolder = useCallback(
    async (normalizedName: string, folderId?: string): Promise<SaveTableResult> => {
      try {
        const record =
          yDocReady && workspaceYDoc.doc
            ? getSavedTableFromYDoc(workspaceYDoc.doc, normalizedName)
            : await getSavedTable(normalizedName);
        if (!record) {
          return { ok: false, reason: 'not_found' };
        }
        const updatedRecord: SavedTableRecord = {
          ...record,
          folderId,
          updatedAt: Date.now(),
        };
        await updateSavedTable(updatedRecord);
        runInYDoc((doc) => upsertSavedTableInYDoc(doc, updatedRecord));
        await refresh();
        return { ok: true, normalizedName };
      } catch (err) {
        return {
          ok: false,
          reason: 'error',
          message: err instanceof Error ? err.message : '移动失败',
        };
      }
    },
    [refresh, runInYDoc, workspaceYDoc.doc, yDocReady],
  );

  // 清理指定文件夹ID关联的表（将它们移回未分组）
  const clearTablesFromFolders = useCallback(
    async (folderIds: string[]): Promise<void> => {
      const folderIdSet = new Set(folderIds);
      const tables = savedTables.filter(
        (table) => table.folderId && folderIdSet.has(table.folderId),
      );
      const updatedRecords = (
        await Promise.all(
          tables.map(async (table): Promise<SavedTableRecord | null> => {
            const record =
              yDocReady && workspaceYDoc.doc
                ? getSavedTableFromYDoc(workspaceYDoc.doc, table.normalizedName)
                : await getSavedTable(table.normalizedName);
            if (!record) return null;
            return {
              ...record,
              folderId: undefined,
              updatedAt: Date.now(),
            } satisfies SavedTableRecord;
          }),
        )
      ).filter((record): record is SavedTableRecord => record != null);
      await updateSavedTables(updatedRecords);
      runInYDoc((doc) => {
        for (const record of updatedRecords) {
          upsertSavedTableInYDoc(doc, record);
        }
      });
      await refresh();
    },
    [refresh, runInYDoc, savedTables, workspaceYDoc.doc, yDocReady],
  );

  return {
    savedTables,
    trashedTables,
    loading,
    error,
    refresh,
    saveTable,
    overwriteTable,
    deleteTable,
    restoreTable,
    deleteTablePermanently,
    renameTable,
    loadTable,
    moveTableToFolder,
    clearTablesFromFolders,
  };
}
