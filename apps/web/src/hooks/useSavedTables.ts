import { useCallback, useEffect, useState } from 'react';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { useAuthSession } from '@/auth/AuthSessionProvider';
import { WORKSPACE_SNAPSHOT_APPLIED_EVENT } from '@/services/workspaceSyncService';
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
import { getAnonymousWorkspaceScope, setCurrentWorkspaceScope } from '@/utils/workspaceScope';

export type SavedTableSummary = SavedTableMetadata;

export type SaveTableResult =
  | { ok: true; normalizedName: string }
  | {
      ok: false;
      reason: 'duplicate' | 'not_found' | 'error';
      message?: string;
    };

export function useSavedTables() {
  const authSession = useAuthSession();
  const [savedTables, setSavedTables] = useState<SavedTableSummary[]>([]);
  const [trashedTables, setTrashedTables] = useState<SavedTableSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const [metadata, trashedMetadata] = await Promise.all([
        listSavedTableMetadata(),
        listTrashedSavedTableMetadata(),
      ]);
      const sorted = metadata.sort((a, b) => b.updatedAt - a.updatedAt);
      const sortedTrashed = trashedMetadata.sort((a, b) => (b.trashedAt ?? 0) - (a.trashedAt ?? 0));
      setSavedTables(sorted);
      setTrashedTables(sortedTrashed);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const nextScope =
      authSession.status === 'signed_in' && authSession.userId
        ? { kind: 'user' as const, userId: authSession.userId }
        : getAnonymousWorkspaceScope();
    setCurrentWorkspaceScope(nextScope);
    void refresh();
  }, [authSession.status, authSession.userId, refresh]);

  useEffect(() => {
    const handleSnapshotApplied = () => {
      void refresh();
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
        const existing = await getSavedTable(normalizedName);
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
    [refresh],
  );

  const overwriteTable = useCallback(
    async (normalizedName: string, state: PersistedState): Promise<SaveTableResult> => {
      try {
        const record = await getSavedTable(normalizedName);
        if (!record) {
          return { ok: false, reason: 'not_found' };
        }
        const updatedRecord: SavedTableRecord = {
          ...record,
          state,
          updatedAt: Date.now(),
        };
        await updateSavedTable(updatedRecord);
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
    [refresh],
  );

  const deleteTable = useCallback(
    async (normalizedName: string): Promise<SaveTableResult> => {
      try {
        await moveSavedTableToTrash(normalizedName);
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
    [refresh],
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
    [refresh, savedTables],
  );

  const deleteTablePermanently = useCallback(
    async (normalizedName: string): Promise<SaveTableResult> => {
      try {
        await deleteSavedTable(normalizedName);
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
    [refresh],
  );

  const renameTable = useCallback(
    async (normalizedName: string, newName: string): Promise<SaveTableResult> => {
      try {
        const record = await getSavedTable(normalizedName);
        if (!record) {
          return { ok: false, reason: 'not_found' };
        }
        const displayName = ensureSavedTableName(newName);
        const nextNormalizedName = normalizeSavedTableName(displayName);
        const existing = await getSavedTable(nextNormalizedName);
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
    [refresh],
  );

  const loadTable = useCallback(async (normalizedName: string) => {
    return getSavedTable(normalizedName);
  }, []);

  // 移动表到指定文件夹
  const moveTableToFolder = useCallback(
    async (normalizedName: string, folderId?: string): Promise<SaveTableResult> => {
      try {
        const record = await getSavedTable(normalizedName);
        if (!record) {
          return { ok: false, reason: 'not_found' };
        }
        const updatedRecord: SavedTableRecord = {
          ...record,
          folderId,
          updatedAt: Date.now(),
        };
        await updateSavedTable(updatedRecord);
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
    [refresh],
  );

  // 清理指定文件夹ID关联的表（将它们移回未分组）
  const clearTablesFromFolders = useCallback(
    async (folderIds: string[]): Promise<void> => {
      const tables = savedTables.filter((t) => t.folderId && folderIds.includes(t.folderId));
      await Promise.all(
        tables.map(async (table) => {
          const record = await getSavedTable(table.normalizedName);
          if (!record) return;
          const updatedRecord: SavedTableRecord = {
            ...record,
            folderId: undefined,
            updatedAt: Date.now(),
          };
          await updateSavedTable(updatedRecord);
        }),
      );
      await refresh();
    },
    [savedTables, refresh],
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
