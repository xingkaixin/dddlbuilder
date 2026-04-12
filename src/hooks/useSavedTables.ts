import { useCallback, useEffect, useState } from 'react';
import type { PersistedState } from '@/types';
import { WORKSPACE_SNAPSHOT_APPLIED_EVENT } from '@/services/workspaceSyncService';
import {
  addSavedTable,
  deleteSavedTable,
  ensureSavedTableName,
  getSavedTable,
  listSavedTableMetadata,
  normalizeSavedTableName,
  updateSavedTable,
  type SavedTableMetadata,
  type SavedTableRecord,
} from '@/utils/savedTablesDb';

export type SavedTableSummary = SavedTableMetadata;

export type SaveTableResult =
  | { ok: true; normalizedName: string }
  | {
      ok: false;
      reason: 'duplicate' | 'not_found' | 'error';
      message?: string;
    };

export function useSavedTables() {
  const [savedTables, setSavedTables] = useState<SavedTableSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const metadata = await listSavedTableMetadata();
      const sorted = metadata.sort((a, b) => b.updatedAt - a.updatedAt);
      setSavedTables(sorted);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
        if (existing) {
          return { ok: false, reason: 'duplicate' };
        }
        const now = Date.now();
        await addSavedTable({
          normalizedName,
          name: displayName,
          state,
          createdAt: now,
          updatedAt: now,
        });
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
    loading,
    error,
    refresh,
    saveTable,
    overwriteTable,
    deleteTable,
    renameTable,
    loadTable,
    moveTableToFolder,
    clearTablesFromFolders,
  };
}
