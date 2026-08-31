import {
  savedTableReference,
  type SavedTableTarget,
  type WorkspaceScope,
} from '@ddlbuilder/shared-types/workspace';
import { useCallback } from 'react';
import type { WorkspaceSavedTableMetadataUpdate } from '@ddlbuilder/workspace-core';
import {
  deleteSavedTableFromYDoc,
  getSavedTableFromYDoc,
  listSavedTableRecordsFromYDoc,
  listTrashedSavedTableRecordsFromYDoc,
  recreateSavedTableInYDoc,
  upsertSavedTableInYDoc,
  renameSavedTableInYDoc,
  updateSavedTableMetadataInYDoc,
} from '@/services/workspaceYDocAdapter';
import {
  addSavedTable,
  deleteSavedTable,
  getSavedTable,
  listSavedTables,
  listTrashedSavedTables,
  replaceSavedTable,
  updateSavedTable,
  updateSavedTables,
  updateSavedTableState,
  updateSavedTableMetadata,
} from '@/utils/savedTablesDb';
import {
  applySavedTableStateUpdate,
  type SavedTableStateUpdate,
} from '@/utils/savedTableStateUpdate';
import type { SavedTableRecord } from '@/utils/workspaceStorageTypes';
import {
  deleteIndexedDbSavedTablePermanently,
  finalizeWorkspaceEntityDeletion,
} from '@/services/workspaceHistoryCleanup';
import {
  beginWorkspaceEntityDeletion,
  ensureWorkspaceEntityDeletion,
  runWorkspaceEntityUpdate,
  runWorkspaceEntityWrites,
  type WorkspaceEntityWrite,
} from '@/utils/workspaceEntityDeletion';
import { resolveSavedTableId } from '@/utils/savedTableIdentity';
import { useWorkspaceAuthority } from './useWorkspaceAuthority';
import { requireReadyWorkspaceStorage } from './useWorkspaceStorageTarget';

const entityTargetForRecord = (record: SavedTableRecord, scope: WorkspaceScope) => ({
  scope,
  tableId: resolveSavedTableId(record),
  normalizedName: record.normalizedName,
});

const entityWriteForRecord = (
  record: SavedTableRecord,
  scope: WorkspaceScope,
  mode: WorkspaceEntityWrite['mode'],
): WorkspaceEntityWrite => ({
  target: entityTargetForRecord(record, scope),
  mode,
});

export function useSavedTablePersistence() {
  const authority = useWorkspaceAuthority();
  const { storage } = authority;

  const readTable = useCallback(
    (normalizedName: SavedTableTarget) => {
      const target = requireReadyWorkspaceStorage(storage);
      return target.kind === 'ydoc'
        ? Promise.resolve(getSavedTableFromYDoc(target.yDoc, normalizedName))
        : getSavedTable(normalizedName, target.scope);
    },
    [storage],
  );

  const readAllTables = useCallback(() => {
    const target = requireReadyWorkspaceStorage(storage);
    if (target.kind === 'ydoc') {
      return Promise.resolve({
        active: listSavedTableRecordsFromYDoc(target.yDoc),
        trashed: listTrashedSavedTableRecordsFromYDoc(target.yDoc),
      });
    }
    return Promise.all([listSavedTables(target.scope), listTrashedSavedTables(target.scope)]).then(
      ([active, trashed]) => ({ active, trashed }),
    );
  }, [storage]);

  const putTable = useCallback(
    async (
      record: SavedTableRecord,
      mode: 'add' | 'update' = 'update',
      entityMode: WorkspaceEntityWrite['mode'] = mode === 'add' ? 'activate' : 'update',
    ) => {
      const target = requireReadyWorkspaceStorage(storage);
      if (target.kind === 'ydoc') {
        const entityTarget = entityTargetForRecord(record, target.scope);
        await runWorkspaceEntityWrites([{ target: entityTarget, mode: entityMode }], [], () =>
          target.transact((doc) =>
            entityMode === 'activate'
              ? recreateSavedTableInYDoc(doc, record)
              : upsertSavedTableInYDoc(doc, record),
          ),
        );
      } else {
        await (mode === 'add'
          ? addSavedTable(record, target.scope, entityMode)
          : updateSavedTable(record, target.scope, entityMode));
      }
    },
    [storage],
  );

  const putTables = useCallback(
    async (records: SavedTableRecord[], activatedTableIds: ReadonlySet<string> = new Set()) => {
      const target = requireReadyWorkspaceStorage(storage);
      if (target.kind === 'ydoc') {
        await runWorkspaceEntityWrites(
          records.map((record) =>
            entityWriteForRecord(
              record,
              target.scope,
              activatedTableIds.has(resolveSavedTableId(record)) ? 'activate' : 'update',
            ),
          ),
          [],
          () =>
            target.transact((doc) => {
              for (const record of records) {
                if (activatedTableIds.has(resolveSavedTableId(record))) {
                  recreateSavedTableInYDoc(doc, record);
                } else {
                  upsertSavedTableInYDoc(doc, record);
                }
              }
            }),
        );
      } else {
        await updateSavedTables(records, target.scope, activatedTableIds);
      }
    },
    [storage],
  );

  const updateTableState = useCallback(
    async (target: SavedTableTarget, update: SavedTableStateUpdate) => {
      const destination = requireReadyWorkspaceStorage(storage);
      if (destination.kind === 'ydoc') {
        const current = getSavedTableFromYDoc(destination.yDoc, target);
        if (!current) return null;
        let updated: SavedTableRecord | null = null;
        await runWorkspaceEntityUpdate(
          [entityTargetForRecord(current, destination.scope)],
          [],
          () => {
            updated = destination.transact((doc) => {
              const record = applySavedTableStateUpdate(target, update, (reference) =>
                getSavedTableFromYDoc(doc, reference),
              );
              if (record) upsertSavedTableInYDoc(doc, record);
              return record;
            });
          },
        );
        return updated;
      }
      return updateSavedTableState(target, update, destination.scope);
    },
    [storage],
  );

  const updateTableMetadata = useCallback(
    async (target: SavedTableTarget, update: WorkspaceSavedTableMetadataUpdate) => {
      const destination = requireReadyWorkspaceStorage(storage);
      if (destination.kind === 'indexeddb') {
        return updateSavedTableMetadata(target, update, destination.scope);
      }
      const current = getSavedTableFromYDoc(destination.yDoc, target);
      if (!current) return null;
      const entityTarget = entityTargetForRecord(current, destination.scope);
      let updated: SavedTableRecord | null = null;
      await runWorkspaceEntityUpdate([entityTarget], [], () => {
        updated = destination.transact((doc) =>
          updateSavedTableMetadataInYDoc(doc, entityTarget, update),
        );
      });
      return updated;
    },
    [storage],
  );

  const replaceTable = useCallback(
    async (
      previousNormalizedName: string,
      record: SavedTableRecord,
      entityMode: WorkspaceEntityWrite['mode'] = 'update',
    ) => {
      const target = requireReadyWorkspaceStorage(storage);
      if (target.kind === 'ydoc') {
        const entityTarget = entityTargetForRecord(record, target.scope);
        await runWorkspaceEntityWrites([{ target: entityTarget, mode: entityMode }], [], () =>
          target.transact((doc) =>
            entityMode === 'activate'
              ? recreateSavedTableInYDoc(doc, record)
              : renameSavedTableInYDoc(doc, previousNormalizedName, record),
          ),
        );
      } else {
        await replaceSavedTable(previousNormalizedName, record, target.scope, entityMode);
      }
    },
    [storage],
  );

  const moveTableToTrash = useCallback(
    async (normalizedName: SavedTableTarget) => {
      const timestamp = Date.now();
      console.info(
        JSON.stringify({
          event: 'workspace_trash_write',
          entityType: 'saved_table',
          ...savedTableReference(normalizedName),
          target: storage.kind,
          yDocReady: storage.kind === 'ydoc',
        }),
      );
      return updateTableMetadata(normalizedName, {
        trashedAt: timestamp,
        updatedAt: timestamp,
      });
    },
    [updateTableMetadata, storage.kind],
  );

  const cleanupLocalTable = useCallback(
    (normalizedName: SavedTableTarget) => {
      if (storage.kind !== 'ydoc') return Promise.resolve();
      return deleteSavedTable(normalizedName, storage.scope);
    },
    [storage],
  );

  const deleteTablePermanently = useCallback(
    async (record: SavedTableRecord) => {
      const target = requireReadyWorkspaceStorage(storage);
      const reference = {
        tableId: resolveSavedTableId(record),
        normalizedName: record.normalizedName,
      };
      const entityTarget = entityTargetForRecord(record, target.scope);

      if (target.kind === 'indexeddb') {
        await deleteIndexedDbSavedTablePermanently(entityTarget);
        return;
      }

      let operationId: string;
      try {
        operationId = await beginWorkspaceEntityDeletion(entityTarget, () =>
          target.transact((doc) => deleteSavedTableFromYDoc(doc, reference)),
        );
      } catch (error) {
        if (getSavedTableFromYDoc(target.yDoc, reference)) throw error;
        operationId = (await ensureWorkspaceEntityDeletion(entityTarget)).operationId;
      }
      await deleteSavedTable(reference, target.scope).catch((error: unknown) =>
        console.error('[workspace] table cache cleanup failed', error),
      );
      await finalizeWorkspaceEntityDeletion(entityTarget, operationId).catch((error: unknown) =>
        console.error('[workspace] table history cleanup failed', error),
      );
    },
    [storage],
  );

  return {
    ...authority,
    readTable,
    readAllTables,
    putTable,
    putTables,
    updateTableState,
    updateTableMetadata,
    replaceTable,
    moveTableToTrash,
    cleanupLocalTable,
    deleteTablePermanently,
  };
}
