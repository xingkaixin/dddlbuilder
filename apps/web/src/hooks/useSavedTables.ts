import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import type * as Y from 'yjs';
import { createEntityId, type PersistedState } from '@ddlbuilder/shared-types';
import {
  listSavedTableMetadataFromYDoc,
  listTrashedSavedTableMetadataFromYDoc,
} from '@/services/workspaceYDocAdapter';
import { ensureSavedTableName, normalizeSavedTableName } from '@/utils/savedTablesDb';
import type { SavedTableMetadata, SavedTableRecord } from '@/utils/workspaceStorageTypes';
import {
  buildSavedTableBatchImportPlan,
  type SavedTableBatchImportRequest,
  type SavedTableBatchImportResult,
} from '@/utils/savedTableBatchImport';
import { useSavedTablePersistence } from '@/hooks/workspacePersistence/useSavedTablePersistence';
import { useWorkspaceYDocProjection } from '@/hooks/useWorkspaceYDocProjection';
import { localSavedTablesOptions, localTrashedTablesOptions } from '@/queries/workspaceLocal';
import { countVersions, createVersion } from '@/utils/tableVersions';
import { resolveSavedTableId } from '@/utils/savedTableIdentity';

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
    refresh,
    readTable,
    readAllTables,
    putTable,
    putTables,
    replaceTable,
    moveTableToTrash,
    cleanupLocalTable,
    deleteTableEverywhere,
  } = useSavedTablePersistence();
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
      await putTable(record, mode);
    },
    [putTable],
  );

  const saveTable = useCallback(
    async (name: string, state: PersistedState): Promise<SaveTableResult> => {
      try {
        if (!currentScope) throw new Error('工作区未就绪');
        const displayName = ensureSavedTableName(name);
        const normalizedName = normalizeSavedTableName(displayName);
        const existing = await readTable(normalizedName);
        if (existing && !existing.trashedAt) {
          return { ok: false, reason: 'duplicate' };
        }
        const now = Date.now();
        const tableId = existing?.tableId ?? createEntityId();
        await persistActiveTable(
          {
            tableId,
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
    [currentScope, persistActiveTable, readTable, refresh],
  );

  const overwriteTable = useCallback(
    async (normalizedName: string, state: PersistedState): Promise<SaveTableResult> => {
      try {
        if (!currentScope) throw new Error('工作区未就绪');
        const record = await readTable(normalizedName);
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
    [currentScope, persistActiveTable, readTable, refresh],
  );

  const deleteTable = useCallback(
    async (normalizedName: string): Promise<SaveTableResult> => {
      try {
        if (!currentScope) throw new Error('工作区未就绪');
        const moved = await moveTableToTrash(normalizedName);
        if (!moved) return { ok: false, reason: 'not_found' };
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
    [currentScope, moveTableToTrash, refresh],
  );

  const restoreTable = useCallback(
    async (
      normalizedName: string,
      options?: { existingFolderIds?: Set<string> },
    ): Promise<SaveTableResult> => {
      try {
        if (!currentScope) throw new Error('工作区未就绪');
        const record = await readTable(normalizedName);
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

        await replaceTable(normalizedName, restoredRecord);
        await cleanupLocalTable(normalizedName);
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
    [cleanupLocalTable, currentScope, readTable, refresh, replaceTable, savedTables],
  );

  const deleteTablePermanently = useCallback(
    async (normalizedName: string): Promise<SaveTableResult> => {
      try {
        if (!currentScope) throw new Error('工作区未就绪');
        await deleteTableEverywhere(normalizedName);
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
    [currentScope, deleteTableEverywhere, refresh],
  );

  const renameTable = useCallback(
    async (normalizedName: string, newName: string): Promise<SaveTableResult> => {
      try {
        if (!currentScope) throw new Error('工作区未就绪');
        const record = await readTable(normalizedName);
        if (!record) {
          return { ok: false, reason: 'not_found' };
        }
        const displayName = ensureSavedTableName(newName);
        const nextNormalizedName = normalizeSavedTableName(displayName);
        const existing = await readTable(nextNormalizedName);
        if (existing && existing.normalizedName !== normalizedName) {
          return { ok: false, reason: 'duplicate' };
        }
        const updatedRecord: SavedTableRecord = {
          ...record,
          name: displayName,
          normalizedName: nextNormalizedName,
          updatedAt: Date.now(),
        };
        await replaceTable(normalizedName, updatedRecord);
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
    [currentScope, readTable, refresh, replaceTable],
  );

  const loadTable = useCallback((normalizedName: string) => readTable(normalizedName), [readTable]);
  const loadTables = useCallback(async () => (await readAllTables()).active, [readAllTables]);
  const resolveVersionTarget = useCallback(
    async (normalizedName: string) => {
      if (!currentScope) throw new Error('工作区未就绪');
      const record = await readTable(normalizedName);
      if (!record) throw new Error('未找到保存的表');
      return {
        scope: currentScope,
        tableId: resolveSavedTableId(record),
        normalizedName: record.normalizedName,
      };
    },
    [currentScope, readTable],
  );
  const countTableVersions = useCallback(
    async (normalizedName: string) => countVersions(await resolveVersionTarget(normalizedName)),
    [resolveVersionTarget],
  );
  const createTableVersion = useCallback(
    async (normalizedName: string, state: PersistedState, message?: string) =>
      createVersion(await resolveVersionTarget(normalizedName), state, message),
    [resolveVersionTarget],
  );

  // 移动表到指定文件夹
  const moveTableToFolder = useCallback(
    async (normalizedName: string, folderId?: string): Promise<SaveTableResult> => {
      try {
        if (!currentScope) throw new Error('工作区未就绪');
        const record = await readTable(normalizedName);
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
    [currentScope, persistActiveTable, readTable, refresh],
  );

  const importTables = useCallback(
    async (request: SavedTableBatchImportRequest): Promise<SavedTableBatchImportResult> => {
      if (!currentScope) {
        return { successCount: 0, skipCount: 0, failCount: request.items.length };
      }

      let skipCount = 0;
      try {
        const { active: activeRecords, trashed: trashedRecords } = await readAllTables();
        const plan = buildSavedTableBatchImportPlan(
          request,
          [...trashedRecords, ...activeRecords],
          Date.now(),
        );
        skipCount = plan.skipCount;

        await putTables(plan.records);
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
    [currentScope, putTables, readAllTables, refresh],
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
    loadTables,
    countTableVersions,
    createTableVersion,
    moveTableToFolder,
    importTables,
  };
}
