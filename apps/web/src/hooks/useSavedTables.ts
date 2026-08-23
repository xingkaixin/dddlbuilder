import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import type * as Y from 'yjs';
import type { PersistedState } from '@ddlbuilder/shared-types';
import {
  deleteSavedTableFromYDoc,
  getSavedTableFromYDoc,
  listSavedTableMetadataFromYDoc,
  listSavedTableRecordsFromYDoc,
  listTrashedSavedTableMetadataFromYDoc,
  listTrashedSavedTableRecordsFromYDoc,
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
} from '@/utils/savedTablesDb';
import type { SavedTableMetadata, SavedTableRecord } from '@/utils/workspaceStorageTypes';
import {
  buildSavedTableBatchImportPlan,
  type SavedTableBatchImportRequest,
  type SavedTableBatchImportResult,
} from '@/utils/savedTableBatchImport';
import { useWorkspaceEntityPersistence } from '@/hooks/workspacePersistence/useWorkspaceEntityPersistence';
import { useWorkspaceYDocProjection } from '@/hooks/useWorkspaceYDocProjection';
import { localSavedTablesOptions, localTrashedTablesOptions } from '@/queries/workspaceLocal';

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
const EMPTY_SAVED_TABLE_PROJECTION = {
  savedTables: EMPTY_SAVED_TABLES,
  trashedTables: EMPTY_SAVED_TABLES,
};
const readSavedTablesProjection = (doc: Y.Doc) => ({
  savedTables: listSavedTableMetadataFromYDoc(doc),
  trashedTables: listTrashedSavedTableMetadataFromYDoc(doc),
});

export function useSavedTables() {
  const {
    scope: currentScope,
    yDoc,
    yDocReady,
    runInYDoc,
    refresh,
    read,
    write,
    writeLocalFallback,
  } = useWorkspaceEntityPersistence();
  const yDocProjection = useWorkspaceYDocProjection(
    yDoc,
    SAVED_TABLE_COLLECTIONS,
    readSavedTablesProjection,
    EMPTY_SAVED_TABLE_PROJECTION,
  );
  const localSavedTablesQuery = useQuery({
    ...localSavedTablesOptions(currentScope),
    enabled: Boolean(currentScope && !yDocReady),
  });
  const trashedTablesQuery = useQuery({
    ...localTrashedTablesOptions(currentScope),
    enabled: Boolean(currentScope && !yDocReady),
  });
  const savedTables = sortSavedTablesByCreatedAt(
    yDocReady ? yDocProjection.savedTables : (localSavedTablesQuery.data ?? []),
  );
  const trashedTables = [
    ...(yDocReady ? yDocProjection.trashedTables : (trashedTablesQuery.data ?? [])),
  ].sort((a, b) => (b.trashedAt ?? 0) - (a.trashedAt ?? 0));
  const loading =
    !currentScope ||
    (!yDocReady && (trashedTablesQuery.isPending || localSavedTablesQuery.isPending));
  const queryError = localSavedTablesQuery.error ?? trashedTablesQuery.error;
  const error = queryError ? (queryError instanceof Error ? queryError.message : '读取失败') : null;

  const persistActiveTable = useCallback(
    async (record: SavedTableRecord, mode: 'add' | 'update' = 'update') => {
      await write({
        toYDoc: (doc) => upsertSavedTableInYDoc(doc, record),
        toLocal: (scope) =>
          mode === 'add' ? addSavedTable(record, scope) : updateSavedTable(record, scope),
      });
    },
    [write],
  );

  const saveTable = useCallback(
    async (name: string, state: PersistedState): Promise<SaveTableResult> => {
      try {
        if (!currentScope) throw new Error('工作区未就绪');
        const displayName = ensureSavedTableName(name);
        const normalizedName = normalizeSavedTableName(displayName);
        const existing = await read({
          fromYDoc: (doc) => getSavedTableFromYDoc(doc, normalizedName),
          fromLocal: (scope) => getSavedTable(normalizedName, scope),
        });
        if (existing && !existing.trashedAt) {
          return { ok: false, reason: 'duplicate' };
        }
        const now = Date.now();
        await persistActiveTable(
          {
            normalizedName,
            name: displayName,
            state,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
          },
          existing?.trashedAt ? 'update' : 'add',
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
    [currentScope, persistActiveTable, read, refresh],
  );

  const overwriteTable = useCallback(
    async (normalizedName: string, state: PersistedState): Promise<SaveTableResult> => {
      try {
        if (!currentScope) throw new Error('工作区未就绪');
        const record = await read({
          fromYDoc: (doc) => getSavedTableFromYDoc(doc, normalizedName),
          fromLocal: (scope) => getSavedTable(normalizedName, scope),
        });
        if (!record) {
          return { ok: false, reason: 'not_found' };
        }
        const updatedRecord: SavedTableRecord = {
          ...record,
          state,
          updatedAt: Date.now(),
        };
        await persistActiveTable(updatedRecord);
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
    [currentScope, persistActiveTable, read, refresh],
  );

  const deleteTable = useCallback(
    async (normalizedName: string): Promise<SaveTableResult> => {
      try {
        if (!currentScope) throw new Error('工作区未就绪');
        if (yDoc) {
          const record = getSavedTableFromYDoc(yDoc, normalizedName);
          if (!record) return { ok: false, reason: 'not_found' };
          const timestamp = Date.now();
          console.info(
            JSON.stringify({
              event: 'workspace_trash_write',
              entityType: 'saved_table',
              normalizedName,
              target: 'ydoc',
              yDocReady: true,
            }),
          );
          runInYDoc((doc) =>
            upsertSavedTableInYDoc(doc, {
              ...record,
              trashedAt: timestamp,
              updatedAt: timestamp,
            }),
          );
        } else {
          await writeLocalFallback(() => moveSavedTableToTrash(normalizedName, currentScope));
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
    [currentScope, refresh, runInYDoc, writeLocalFallback, yDoc],
  );

  const restoreTable = useCallback(
    async (
      normalizedName: string,
      options?: { existingFolderIds?: Set<string> },
    ): Promise<SaveTableResult> => {
      try {
        if (!currentScope) throw new Error('工作区未就绪');
        const record = yDoc
          ? getSavedTableFromYDoc(yDoc, normalizedName)
          : await getSavedTable(normalizedName, currentScope);
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

        if (yDoc) {
          runInYDoc((doc) => upsertSavedTableInYDoc(doc, restoredRecord));
          await deleteSavedTable(normalizedName, currentScope);
        } else {
          await writeLocalFallback(async () => {
            if (targetNormalizedName !== normalizedName) {
              await addSavedTable(restoredRecord, currentScope);
              await deleteSavedTable(normalizedName, currentScope);
              return;
            }
            await updateSavedTable(restoredRecord, currentScope);
          });
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
    [currentScope, refresh, runInYDoc, savedTables, writeLocalFallback, yDoc],
  );

  const deleteTablePermanently = useCallback(
    async (normalizedName: string): Promise<SaveTableResult> => {
      try {
        if (!currentScope) throw new Error('工作区未就绪');
        if (yDoc) {
          await deleteSavedTable(normalizedName, currentScope);
        } else {
          await writeLocalFallback(() => deleteSavedTable(normalizedName, currentScope));
        }
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
    [currentScope, refresh, runInYDoc, writeLocalFallback, yDoc],
  );

  const renameTable = useCallback(
    async (normalizedName: string, newName: string): Promise<SaveTableResult> => {
      try {
        if (!currentScope) throw new Error('工作区未就绪');
        const record = await read({
          fromYDoc: (doc) => getSavedTableFromYDoc(doc, normalizedName),
          fromLocal: (scope) => getSavedTable(normalizedName, scope),
        });
        if (!record) {
          return { ok: false, reason: 'not_found' };
        }
        const displayName = ensureSavedTableName(newName);
        const nextNormalizedName = normalizeSavedTableName(displayName);
        const existing = await read({
          fromYDoc: (doc) => getSavedTableFromYDoc(doc, nextNormalizedName),
          fromLocal: (scope) => getSavedTable(nextNormalizedName, scope),
        });
        if (existing && existing.normalizedName !== normalizedName) {
          return { ok: false, reason: 'duplicate' };
        }
        const updatedRecord: SavedTableRecord = {
          ...record,
          name: displayName,
          normalizedName: nextNormalizedName,
          updatedAt: Date.now(),
        };
        await write({
          toYDoc: (doc) => {
            upsertSavedTableInYDoc(doc, updatedRecord);
            if (nextNormalizedName !== normalizedName) {
              deleteSavedTableFromYDoc(doc, normalizedName);
            }
          },
          toLocal: async (scope) => {
            if (nextNormalizedName === normalizedName) {
              await updateSavedTable(updatedRecord, scope);
              return;
            }
            await addSavedTable(updatedRecord, scope);
            await deleteSavedTable(normalizedName, scope);
          },
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
    [currentScope, read, refresh, write],
  );

  const loadTable = useCallback(
    (normalizedName: string) =>
      read({
        fromYDoc: (doc) => getSavedTableFromYDoc(doc, normalizedName),
        fromLocal: (scope) => getSavedTable(normalizedName, scope),
      }),
    [read],
  );

  // 移动表到指定文件夹
  const moveTableToFolder = useCallback(
    async (normalizedName: string, folderId?: string): Promise<SaveTableResult> => {
      try {
        if (!currentScope) throw new Error('工作区未就绪');
        const record = await read({
          fromYDoc: (doc) => getSavedTableFromYDoc(doc, normalizedName),
          fromLocal: (scope) => getSavedTable(normalizedName, scope),
        });
        if (!record) {
          return { ok: false, reason: 'not_found' };
        }
        const updatedRecord: SavedTableRecord = {
          ...record,
          folderId,
          updatedAt: Date.now(),
        };
        await persistActiveTable(updatedRecord);
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
    [currentScope, persistActiveTable, read, refresh],
  );

  const importTables = useCallback(
    async (request: SavedTableBatchImportRequest): Promise<SavedTableBatchImportResult> => {
      if (!currentScope) {
        return { successCount: 0, skipCount: 0, failCount: request.items.length };
      }

      let skipCount = 0;
      try {
        const [activeRecords, trashedRecords] = await Promise.all([
          read({
            fromYDoc: listSavedTableRecordsFromYDoc,
            fromLocal: listSavedTables,
          }),
          read({
            fromYDoc: listTrashedSavedTableRecordsFromYDoc,
            fromLocal: listTrashedSavedTables,
          }),
        ]);
        const plan = buildSavedTableBatchImportPlan(
          request,
          [...trashedRecords, ...activeRecords],
          Date.now(),
        );
        skipCount = plan.skipCount;

        await write({
          toYDoc: (doc) => {
            for (const record of plan.records) upsertSavedTableInYDoc(doc, record);
          },
          toLocal: (scope) => updateSavedTables(plan.records, scope),
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
    [currentScope, read, refresh, write],
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
            const record = await read({
              fromYDoc: (doc) => getSavedTableFromYDoc(doc, table.normalizedName),
              fromLocal: (scope) => getSavedTable(table.normalizedName, scope),
            });
            if (!record) return null;
            return {
              ...record,
              folderId: undefined,
              updatedAt: Date.now(),
            } satisfies SavedTableRecord;
          }),
        )
      ).filter((record): record is SavedTableRecord => record != null);
      await write({
        toYDoc: (doc) => {
          for (const record of updatedRecords) upsertSavedTableInYDoc(doc, record);
        },
        toLocal: (scope) => updateSavedTables(updatedRecords, scope),
      });
      await refresh();
    },
    [currentScope, read, refresh, savedTables, write],
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
