import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { useAuthSession } from '@/auth/AuthSessionProvider';
import { useWorkspaceYDoc } from '@/providers/WorkspaceYDocProvider';
import { buildWorkspaceContentHash } from '@/services/workspaceIncrementalSyncService';
import { WORKSPACE_SNAPSHOT_APPLIED_EVENT } from '@/services/workspaceSyncService';
import { shouldQueueWorkspaceEntityOutbox } from '@/services/workspaceYDocAuthority';
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
  type SavedTableMetadata,
  type SavedTableRecord,
} from '@/utils/savedTablesDb';
import { enqueueWorkspaceOutboxItem } from '@/utils/workspaceSyncStateDb';
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

  const queueSavedTableChange = useCallback(
    async (record: SavedTableRecord, op: 'upsert' | 'delete' = 'upsert') => {
      const outboxPolicy = { scope: currentScope, yDocReady };
      if (!shouldQueueWorkspaceEntityOutbox(outboxPolicy)) return;
      const payload =
        op === 'upsert'
          ? {
              name: record.name,
              state: record.state,
              createdAt: record.createdAt,
              folderId: record.folderId,
            }
          : null;
      await enqueueWorkspaceOutboxItem({
        workspaceId: outboxPolicy.scope.workspaceId,
        entityType: 'saved_table',
        entityId: record.normalizedName,
        op,
        payload,
        contentHash: op === 'upsert' ? await buildWorkspaceContentHash(payload) : null,
      });
    },
    [currentScope, yDocReady],
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
        await queueSavedTableChange({
          normalizedName,
          name: displayName,
          state,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        });
        if (yDocReady && workspaceYDoc.doc) {
          const doc = workspaceYDoc.doc;
          doc.transact(() => {
            upsertSavedTableInYDoc(doc, {
              normalizedName,
              name: displayName,
              state,
              createdAt: existing?.createdAt ?? now,
              updatedAt: now,
            });
          });
        }
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
    [queueSavedTableChange, refresh, workspaceYDoc.doc, yDocReady],
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
        await queueSavedTableChange(updatedRecord);
        if (yDocReady && workspaceYDoc.doc) {
          const doc = workspaceYDoc.doc;
          doc.transact(() => {
            upsertSavedTableInYDoc(doc, updatedRecord);
          });
        }
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
    [queueSavedTableChange, refresh, workspaceYDoc.doc, yDocReady],
  );

  const deleteTable = useCallback(
    async (normalizedName: string): Promise<SaveTableResult> => {
      try {
        const record = await getSavedTable(normalizedName);
        await moveSavedTableToTrash(normalizedName);
        if (yDocReady && workspaceYDoc.doc) {
          const doc = workspaceYDoc.doc;
          doc.transact(() => {
            deleteSavedTableFromYDoc(doc, normalizedName);
          });
        }
        if (record) {
          await queueSavedTableChange(record, 'delete');
        }
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
    [queueSavedTableChange, refresh, workspaceYDoc.doc, yDocReady],
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

        await queueSavedTableChange(restoredRecord);
        if (yDocReady && workspaceYDoc.doc) {
          const doc = workspaceYDoc.doc;
          doc.transact(() => {
            upsertSavedTableInYDoc(doc, restoredRecord);
          });
        }
        if (targetNormalizedName !== normalizedName) {
          await queueSavedTableChange(record, 'delete');
          if (yDocReady && workspaceYDoc.doc) {
            const doc = workspaceYDoc.doc;
            doc.transact(() => {
              deleteSavedTableFromYDoc(doc, normalizedName);
            });
          }
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
    [queueSavedTableChange, refresh, savedTables, workspaceYDoc.doc, yDocReady],
  );

  const deleteTablePermanently = useCallback(
    async (normalizedName: string): Promise<SaveTableResult> => {
      try {
        const record =
          yDocReady && workspaceYDoc.doc
            ? getSavedTableFromYDoc(workspaceYDoc.doc, normalizedName)
            : await getSavedTable(normalizedName);
        await deleteSavedTable(normalizedName);
        if (yDocReady && workspaceYDoc.doc) {
          const doc = workspaceYDoc.doc;
          doc.transact(() => {
            deleteSavedTableFromYDoc(doc, normalizedName);
          });
        }
        if (record) {
          await queueSavedTableChange(record, 'delete');
        }
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
    [queueSavedTableChange, refresh, workspaceYDoc.doc, yDocReady],
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
        await queueSavedTableChange(updatedRecord);
        if (yDocReady && workspaceYDoc.doc) {
          const doc = workspaceYDoc.doc;
          doc.transact(() => {
            upsertSavedTableInYDoc(doc, updatedRecord);
            if (nextNormalizedName !== normalizedName) {
              deleteSavedTableFromYDoc(doc, normalizedName);
            }
          });
        }
        if (nextNormalizedName !== normalizedName) {
          await queueSavedTableChange(record, 'delete');
        }
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
    [queueSavedTableChange, refresh, workspaceYDoc.doc, yDocReady],
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
        await queueSavedTableChange(updatedRecord);
        if (yDocReady && workspaceYDoc.doc) {
          const doc = workspaceYDoc.doc;
          doc.transact(() => {
            upsertSavedTableInYDoc(doc, updatedRecord);
          });
        }
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
    [queueSavedTableChange, refresh, workspaceYDoc.doc, yDocReady],
  );

  // 清理指定文件夹ID关联的表（将它们移回未分组）
  const clearTablesFromFolders = useCallback(
    async (folderIds: string[]): Promise<void> => {
      const tables = savedTables.filter((t) => t.folderId && folderIds.includes(t.folderId));
      await Promise.all(
        tables.map(async (table) => {
          const record =
            yDocReady && workspaceYDoc.doc
              ? getSavedTableFromYDoc(workspaceYDoc.doc, table.normalizedName)
              : await getSavedTable(table.normalizedName);
          if (!record) return;
          const updatedRecord: SavedTableRecord = {
            ...record,
            folderId: undefined,
            updatedAt: Date.now(),
          };
          await updateSavedTable(updatedRecord);
          await queueSavedTableChange(updatedRecord);
          if (yDocReady && workspaceYDoc.doc) {
            const doc = workspaceYDoc.doc;
            doc.transact(() => {
              upsertSavedTableInYDoc(doc, updatedRecord);
            });
          }
        }),
      );
      await refresh();
    },
    [queueSavedTableChange, savedTables, refresh, workspaceYDoc.doc, yDocReady],
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
