import { useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type * as Y from 'yjs';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { WORKSPACE_SNAPSHOT_APPLIED_EVENT } from '@/services/workspaceSyncService';
import { invalidateLegacyWorkspaceMigration } from '@/services/workspaceLegacyMigrationMarker';
import {
  deleteSavedTableFromYDoc,
  getSavedTableFromYDoc,
  listSavedTableMetadataFromYDoc,
  listSavedTableRecordsFromYDoc,
  upsertSavedTableInYDoc,
} from '@/services/workspaceYDocAdapter';
import {
  addSavedTable,
  deleteSavedTable,
  ensureSavedTableName,
  getSavedTable,
  listSavedTables,
  listTrashedSavedTables,
  moveSavedTableToTrash,
  normalizeSavedTableName,
  updateSavedTable,
  updateSavedTables,
  type SavedTableMetadata,
  type SavedTableRecord,
} from '@/utils/savedTablesDb';
import {
  buildSavedTableBatchImportPlan,
  type SavedTableBatchImportRequest,
  type SavedTableBatchImportResult,
} from '@/utils/savedTableBatchImport';
import { useWorkspaceYDocGateway } from '@/hooks/useWorkspaceYDocGateway';
import { useWorkspaceScope } from '@/hooks/useWorkspaceScope';
import { useWorkspaceYDocProjection } from '@/hooks/useWorkspaceYDocProjection';
import {
  localSavedTablesOptions,
  localTrashedTablesOptions,
  workspaceLocalQueryKeys,
} from '@/queries/workspaceLocal';

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

const SAVED_TABLE_COLLECTIONS = ['savedTables'] as const;
const EMPTY_SAVED_TABLES: SavedTableSummary[] = [];
const readSavedTablesProjection = (doc: Y.Doc) => listSavedTableMetadataFromYDoc(doc);

export function useSavedTables() {
  const currentScope = useWorkspaceScope();
  const queryClient = useQueryClient();
  // Y.Doc 还不可写（分享页在本地加载完成前仍然放行「另存为副本」），这次改动只落在本地
  // 分区。legacy 迁移的一次性标记会让它永远留在那里，所以按既有契约重开迁移：谁写了本地
  // 分区，谁负责让下次启动把它带进 Y.Doc。
  const { yDoc, yDocReady, runInYDoc } = useWorkspaceYDocGateway(currentScope, {
    onDocUnavailable: () => {
      if (currentScope?.kind === 'user' && currentScope.workspaceId) {
        invalidateLegacyWorkspaceMigration(currentScope);
      }
    },
  });
  const yDocSavedTables = useWorkspaceYDocProjection(
    yDoc,
    SAVED_TABLE_COLLECTIONS,
    readSavedTablesProjection,
    EMPTY_SAVED_TABLES,
  );
  const localSavedTablesQuery = useQuery({
    ...localSavedTablesOptions(currentScope),
    enabled: Boolean(currentScope && !yDocReady),
  });
  const trashedTablesQuery = useQuery({
    ...localTrashedTablesOptions(currentScope),
    enabled: Boolean(currentScope),
  });
  const savedTables = sortSavedTablesByCreatedAt(
    yDocReady ? yDocSavedTables : (localSavedTablesQuery.data ?? []),
  );
  const trashedTables = [...(trashedTablesQuery.data ?? [])].sort(
    (a, b) => (b.trashedAt ?? 0) - (a.trashedAt ?? 0),
  );
  const loading =
    !currentScope ||
    trashedTablesQuery.isPending ||
    (!yDocReady && localSavedTablesQuery.isPending);
  const queryError = localSavedTablesQuery.error ?? trashedTablesQuery.error;
  const error = queryError ? (queryError instanceof Error ? queryError.message : '读取失败') : null;

  const refresh = useCallback(async () => {
    if (!currentScope) return;
    await queryClient.invalidateQueries({
      queryKey: workspaceLocalQueryKeys.scope(currentScope),
    });
  }, [currentScope, queryClient]);

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
        if (!currentScope) throw new Error('工作区未就绪');
        const displayName = ensureSavedTableName(name);
        const normalizedName = normalizeSavedTableName(displayName);
        const existing = yDoc
          ? getSavedTableFromYDoc(yDoc, normalizedName)
          : await getSavedTable(normalizedName, currentScope);
        if (existing && !existing.trashedAt) {
          return { ok: false, reason: 'duplicate' };
        }
        const now = Date.now();
        if (existing?.trashedAt) {
          await updateSavedTable(
            {
              ...existing,
              name: displayName,
              state,
              trashedAt: undefined,
              updatedAt: now,
            },
            currentScope,
          );
        } else {
          await addSavedTable(
            {
              normalizedName,
              name: displayName,
              state,
              createdAt: now,
              updatedAt: now,
            },
            currentScope,
          );
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
    [currentScope, refresh, runInYDoc, yDoc],
  );

  const overwriteTable = useCallback(
    async (normalizedName: string, state: PersistedState): Promise<SaveTableResult> => {
      try {
        if (!currentScope) throw new Error('工作区未就绪');
        const record = yDoc
          ? getSavedTableFromYDoc(yDoc, normalizedName)
          : await getSavedTable(normalizedName, currentScope);
        if (!record) {
          return { ok: false, reason: 'not_found' };
        }
        const updatedRecord: SavedTableRecord = {
          ...record,
          state,
          updatedAt: Date.now(),
        };
        await updateSavedTable(updatedRecord, currentScope);
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
    [currentScope, refresh, runInYDoc, yDoc],
  );

  const deleteTable = useCallback(
    async (normalizedName: string): Promise<SaveTableResult> => {
      try {
        if (!currentScope) throw new Error('工作区未就绪');
        await moveSavedTableToTrash(normalizedName, currentScope);
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
    [currentScope, refresh, runInYDoc],
  );

  const restoreTable = useCallback(
    async (
      normalizedName: string,
      options?: { existingFolderIds?: Set<string> },
    ): Promise<SaveTableResult> => {
      try {
        if (!currentScope) throw new Error('工作区未就绪');
        const record = await getSavedTable(normalizedName, currentScope);
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
          await addSavedTable(restoredRecord, currentScope);
          await deleteSavedTable(normalizedName, currentScope);
        } else {
          await updateSavedTable(restoredRecord, currentScope);
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
    [currentScope, refresh, runInYDoc, savedTables],
  );

  const deleteTablePermanently = useCallback(
    async (normalizedName: string): Promise<SaveTableResult> => {
      try {
        if (!currentScope) throw new Error('工作区未就绪');
        await deleteSavedTable(normalizedName, currentScope);
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
    [currentScope, refresh, runInYDoc],
  );

  const renameTable = useCallback(
    async (normalizedName: string, newName: string): Promise<SaveTableResult> => {
      try {
        if (!currentScope) throw new Error('工作区未就绪');
        const record = yDoc
          ? getSavedTableFromYDoc(yDoc, normalizedName)
          : await getSavedTable(normalizedName, currentScope);
        if (!record) {
          return { ok: false, reason: 'not_found' };
        }
        const displayName = ensureSavedTableName(newName);
        const nextNormalizedName = normalizeSavedTableName(displayName);
        const existing = yDoc
          ? getSavedTableFromYDoc(yDoc, nextNormalizedName)
          : await getSavedTable(nextNormalizedName, currentScope);
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
          await updateSavedTable(updatedRecord, currentScope);
        } else {
          await addSavedTable(updatedRecord, currentScope);
          await deleteSavedTable(normalizedName, currentScope);
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
    [currentScope, refresh, runInYDoc, yDoc],
  );

  const loadTable = useCallback(
    async (normalizedName: string) => {
      if (!currentScope) throw new Error('工作区未就绪');
      if (yDoc) {
        return getSavedTableFromYDoc(yDoc, normalizedName);
      }
      return getSavedTable(normalizedName, currentScope);
    },
    [currentScope, yDoc],
  );

  // 移动表到指定文件夹
  const moveTableToFolder = useCallback(
    async (normalizedName: string, folderId?: string): Promise<SaveTableResult> => {
      try {
        if (!currentScope) throw new Error('工作区未就绪');
        const record = yDoc
          ? getSavedTableFromYDoc(yDoc, normalizedName)
          : await getSavedTable(normalizedName, currentScope);
        if (!record) {
          return { ok: false, reason: 'not_found' };
        }
        const updatedRecord: SavedTableRecord = {
          ...record,
          folderId,
          updatedAt: Date.now(),
        };
        await updateSavedTable(updatedRecord, currentScope);
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
    [currentScope, refresh, runInYDoc, yDoc],
  );

  const importTables = useCallback(
    async (request: SavedTableBatchImportRequest): Promise<SavedTableBatchImportResult> => {
      if (!currentScope) {
        return { successCount: 0, skipCount: 0, failCount: request.items.length };
      }

      let skipCount = 0;
      try {
        const [activeRecords, trashedRecords] = await Promise.all([
          yDoc
            ? Promise.resolve(listSavedTableRecordsFromYDoc(yDoc))
            : listSavedTables(currentScope),
          listTrashedSavedTables(currentScope),
        ]);
        const plan = buildSavedTableBatchImportPlan(
          request,
          [...trashedRecords, ...activeRecords],
          Date.now(),
        );
        skipCount = plan.skipCount;

        await updateSavedTables(plan.records, currentScope);
        runInYDoc((doc) => {
          for (const record of plan.records) {
            upsertSavedTableInYDoc(doc, record);
          }
        });
        await refresh();

        return {
          successCount: plan.successCount,
          skipCount: plan.skipCount,
          failCount: 0,
        };
      } catch {
        return {
          successCount: 0,
          skipCount,
          failCount: request.items.length - skipCount,
        };
      }
    },
    [currentScope, refresh, runInYDoc, yDoc],
  );

  // 清理指定文件夹ID关联的表（将它们移回未分组）
  const clearTablesFromFolders = useCallback(
    async (folderIds: string[]): Promise<void> => {
      if (!currentScope) throw new Error('工作区未就绪');
      const folderIdSet = new Set(folderIds);
      const tables = savedTables.filter(
        (table) => table.folderId && folderIdSet.has(table.folderId),
      );
      const updatedRecords = (
        await Promise.all(
          tables.map(async (table): Promise<SavedTableRecord | null> => {
            const record = yDoc
              ? getSavedTableFromYDoc(yDoc, table.normalizedName)
              : await getSavedTable(table.normalizedName, currentScope);
            if (!record) return null;
            return {
              ...record,
              folderId: undefined,
              updatedAt: Date.now(),
            } satisfies SavedTableRecord;
          }),
        )
      ).filter((record): record is SavedTableRecord => record != null);
      await updateSavedTables(updatedRecords, currentScope);
      runInYDoc((doc) => {
        for (const record of updatedRecords) {
          upsertSavedTableInYDoc(doc, record);
        }
      });
      await refresh();
    },
    [currentScope, refresh, runInYDoc, savedTables, yDoc],
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
    importTables,
    clearTablesFromFolders,
  };
}
