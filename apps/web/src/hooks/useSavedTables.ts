import { type SavedTableTarget } from '@ddlbuilder/shared-types/workspace';
import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
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
import { migrateReviewsToTable } from '@/utils/reviewHistory';
import { buildQualifiedTableName } from '@ddlbuilder/ddl-core';
import { reportError } from '@/utils/errorReporter';
import type { SavedTableStateUpdate } from '@/utils/savedTableStateUpdate';

export type SavedTableSummary = SavedTableMetadata;

export type SaveTableResult =
  | { ok: true; normalizedName: string; tableId: string }
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
  const { t } = useTranslation();
  const {
    scope: currentScope,
    yDoc,
    yDocReady,
    refresh,
    readTable,
    readAllTables,
    putTable,
    putTables,
    updateTableState,
    replaceTable,
    moveTableToTrash,
    cleanupLocalTable,
    deleteTablePermanently: persistPermanentDeletion,
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
  const error = queryError
    ? queryError instanceof Error
      ? queryError.message
      : t('savedTables.toast.loadFailed')
    : null;

  const persistActiveTable = useCallback(
    async (record: SavedTableRecord, mode: 'add' | 'update' = 'update') => {
      await putTable(record, mode);
    },
    [putTable],
  );

  const saveTable = useCallback(
    async (name: string, state: PersistedState): Promise<SaveTableResult> => {
      try {
        if (!currentScope) throw new Error(t('savedTables.toast.workspaceNotReady'));
        const displayName = ensureSavedTableName(name);
        const normalizedName = normalizeSavedTableName(displayName);
        const { active, trashed } = await readAllTables();
        if (active.some((table) => table.normalizedName === normalizedName)) {
          return { ok: false, reason: 'duplicate' };
        }
        const matchingTrashed = trashed.filter((table) => table.normalizedName === normalizedName);
        const existing = matchingTrashed.length === 1 ? matchingTrashed[0] : undefined;
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
        await migrateReviewsToTable(
          { scope: currentScope, tableId, normalizedName },
          normalizeSavedTableName(buildQualifiedTableName(state.schemaName ?? '', state.tableName)),
        ).catch((error) =>
          reportError(error, {
            scope: 'useSavedTables',
            action: 'migrateReviewsToTable',
            metadata: { tableId, normalizedName },
          }),
        );
        await refresh();
        return { ok: true, normalizedName, tableId };
      } catch (err) {
        return {
          ok: false,
          reason: 'error',
          message: err instanceof Error ? err.message : t('savedTables.toast.saveFailed'),
        };
      }
    },
    [currentScope, persistActiveTable, readAllTables, refresh, t],
  );

  const overwriteTable = useCallback(
    async (target: SavedTableTarget, update: SavedTableStateUpdate): Promise<SaveTableResult> => {
      try {
        if (!currentScope) throw new Error(t('savedTables.toast.workspaceNotReady'));
        const record = await updateTableState(target, update);
        if (!record) {
          return { ok: false, reason: 'not_found' };
        }
        await refresh();
        return {
          ok: true,
          normalizedName: record.normalizedName,
          tableId: resolveSavedTableId(record),
        };
      } catch (err) {
        return {
          ok: false,
          reason: 'error',
          message: err instanceof Error ? err.message : t('savedTables.toast.updateFailed'),
        };
      }
    },
    [currentScope, updateTableState, refresh, t],
  );

  const deleteTable = useCallback(
    async (target: SavedTableTarget): Promise<SaveTableResult> => {
      try {
        if (!currentScope) throw new Error(t('savedTables.toast.workspaceNotReady'));
        const record = await moveTableToTrash(target);
        if (!record) return { ok: false, reason: 'not_found' };
        await refresh();
        return {
          ok: true,
          normalizedName: record.normalizedName,
          tableId: resolveSavedTableId(record),
        };
      } catch (err) {
        return {
          ok: false,
          reason: 'error',
          message: err instanceof Error ? err.message : t('savedTables.toast.deleteFailed'),
        };
      }
    },
    [currentScope, moveTableToTrash, refresh, t],
  );

  const restoreTable = useCallback(
    async (
      target: SavedTableTarget,
      options?: { existingFolderIds?: Set<string> },
    ): Promise<SaveTableResult> => {
      try {
        if (!currentScope) throw new Error(t('savedTables.toast.workspaceNotReady'));
        const record = await readTable(target);
        if (!record) {
          return { ok: false, reason: 'not_found' };
        }

        // 命名冲突解决
        const existingNormalizedNames = new Set(savedTables.map((t) => t.normalizedName));
        let targetNormalizedName = record.normalizedName;
        let targetName = record.name;

        if (existingNormalizedNames.has(record.normalizedName)) {
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

        await replaceTable(record.normalizedName, restoredRecord);
        await cleanupLocalTable(target);
        await refresh();
        return {
          ok: true,
          normalizedName: targetNormalizedName,
          tableId: resolveSavedTableId(record),
        };
      } catch (err) {
        return {
          ok: false,
          reason: 'error',
          message: err instanceof Error ? err.message : t('savedTables.toast.restoreFailed'),
        };
      }
    },
    [cleanupLocalTable, currentScope, readTable, refresh, replaceTable, savedTables, t],
  );

  const deleteTablePermanently = useCallback(
    async (target: SavedTableTarget): Promise<SaveTableResult> => {
      try {
        if (!currentScope) throw new Error(t('savedTables.toast.workspaceNotReady'));
        const record = await readTable(target);
        if (!record) return { ok: false, reason: 'not_found' };
        await persistPermanentDeletion(record);
        await refresh();
        return {
          ok: true,
          normalizedName: record.normalizedName,
          tableId: resolveSavedTableId(record),
        };
      } catch (err) {
        return {
          ok: false,
          reason: 'error',
          message: err instanceof Error ? err.message : t('savedTables.toast.deleteFailed'),
        };
      }
    },
    [currentScope, persistPermanentDeletion, readTable, refresh, t],
  );

  const renameTable = useCallback(
    async (target: SavedTableTarget, newName: string): Promise<SaveTableResult> => {
      try {
        if (!currentScope) throw new Error(t('savedTables.toast.workspaceNotReady'));
        const record = await readTable(target);
        if (!record) {
          return { ok: false, reason: 'not_found' };
        }
        const displayName = ensureSavedTableName(newName);
        const nextNormalizedName = normalizeSavedTableName(displayName);
        const { active, trashed } = await readAllTables();
        const existing = [...active, ...trashed].find(
          (table) =>
            table.normalizedName === nextNormalizedName &&
            resolveSavedTableId(table) !== resolveSavedTableId(record),
        );
        if (existing) {
          return { ok: false, reason: 'duplicate' };
        }
        const updatedRecord: SavedTableRecord = {
          ...record,
          name: displayName,
          normalizedName: nextNormalizedName,
          updatedAt: Date.now(),
        };
        await replaceTable(record.normalizedName, updatedRecord);
        await refresh();
        return {
          ok: true,
          normalizedName: nextNormalizedName,
          tableId: resolveSavedTableId(record),
        };
      } catch (err) {
        return {
          ok: false,
          reason: 'error',
          message: err instanceof Error ? err.message : t('savedTables.toast.renameFailed'),
        };
      }
    },
    [currentScope, readTable, readAllTables, refresh, replaceTable, t],
  );

  const loadTable = useCallback(
    (normalizedName: SavedTableTarget) => readTable(normalizedName),
    [readTable],
  );
  const loadTables = useCallback(async () => (await readAllTables()).active, [readAllTables]);
  const resolveVersionTarget = useCallback(
    async (target: SavedTableTarget) => {
      if (!currentScope) throw new Error(t('savedTables.toast.workspaceNotReady'));
      const record = await readTable(target);
      if (!record) throw new Error(t('savedTables.toast.tableNotFound'));
      return {
        scope: currentScope,
        tableId: resolveSavedTableId(record),
        normalizedName: record.normalizedName,
      };
    },
    [currentScope, readTable, t],
  );
  const countTableVersions = useCallback(
    async (normalizedName: SavedTableTarget) =>
      countVersions(await resolveVersionTarget(normalizedName)),
    [resolveVersionTarget],
  );
  const createTableVersion = useCallback(
    async (normalizedName: SavedTableTarget, state: PersistedState, message?: string) =>
      createVersion(await resolveVersionTarget(normalizedName), state, message),
    [resolveVersionTarget],
  );

  // 移动表到指定文件夹
  const moveTableToFolder = useCallback(
    async (target: SavedTableTarget, folderId?: string): Promise<SaveTableResult> => {
      try {
        if (!currentScope) throw new Error(t('savedTables.toast.workspaceNotReady'));
        const record = await readTable(target);
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
        return {
          ok: true,
          normalizedName: record.normalizedName,
          tableId: resolveSavedTableId(record),
        };
      } catch (err) {
        return {
          ok: false,
          reason: 'error',
          message: err instanceof Error ? err.message : t('savedTables.toast.moveFailed'),
        };
      }
    },
    [currentScope, persistActiveTable, readTable, refresh, t],
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
