import { savedTableReference, type SavedTableTarget } from '@ddlbuilder/shared-types/workspace';
import { useCallback } from 'react';
import {
  deleteSavedTableFromYDoc,
  getSavedTableFromYDoc,
  listSavedTableRecordsFromYDoc,
  listTrashedSavedTableRecordsFromYDoc,
  upsertSavedTableInYDoc,
  renameSavedTableInYDoc,
} from '@/services/workspaceYDocAdapter';
import {
  addSavedTable,
  deleteSavedTable,
  getSavedTable,
  listSavedTables,
  listTrashedSavedTables,
  updateSavedTable,
  updateSavedTables,
  updateSavedTableState,
} from '@/utils/savedTablesDb';
import {
  applySavedTableStateUpdate,
  type SavedTableStateUpdate,
} from '@/utils/savedTableStateUpdate';
import type { SavedTableRecord } from '@/utils/workspaceStorageTypes';
import { deleteAllVersions } from '@/utils/tableVersions';
import { deleteAllReviews } from '@/utils/reviewHistory';
import { resolveSavedTableId } from '@/utils/savedTableIdentity';
import { useWorkspaceAuthority } from './useWorkspaceAuthority';
import { requireReadyWorkspaceStorage } from './useWorkspaceStorageTarget';

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
    async (record: SavedTableRecord, mode: 'add' | 'update' = 'update') => {
      const target = requireReadyWorkspaceStorage(storage);
      if (target.kind === 'ydoc') {
        target.transact((doc) => upsertSavedTableInYDoc(doc, record));
        return;
      }
      await (mode === 'add'
        ? addSavedTable(record, target.scope)
        : updateSavedTable(record, target.scope));
    },
    [storage],
  );

  const putTables = useCallback(
    async (records: SavedTableRecord[]) => {
      const target = requireReadyWorkspaceStorage(storage);
      if (target.kind === 'ydoc') {
        target.transact((doc) => {
          for (const record of records) upsertSavedTableInYDoc(doc, record);
        });
        return;
      }
      await updateSavedTables(records, target.scope);
    },
    [storage],
  );

  const updateTableState = useCallback(
    (target: SavedTableTarget, update: SavedTableStateUpdate) => {
      const destination = requireReadyWorkspaceStorage(storage);
      if (destination.kind === 'ydoc') {
        return Promise.resolve(
          destination.transact((doc) => {
            const record = applySavedTableStateUpdate(target, update, (reference) =>
              getSavedTableFromYDoc(doc, reference),
            );
            if (record) upsertSavedTableInYDoc(doc, record);
            return record;
          }),
        );
      }
      return updateSavedTableState(target, update, destination.scope);
    },
    [storage],
  );

  const replaceTable = useCallback(
    async (previousNormalizedName: string, record: SavedTableRecord) => {
      const target = requireReadyWorkspaceStorage(storage);
      if (target.kind === 'ydoc') {
        target.transact((doc) => renameSavedTableInYDoc(doc, previousNormalizedName, record));
        return;
      }
      if (record.normalizedName === previousNormalizedName) {
        await updateSavedTable(record, target.scope);
        return;
      }
      await addSavedTable(record, target.scope);
      await deleteSavedTable(previousNormalizedName, target.scope);
    },
    [storage],
  );

  const moveTableToTrash = useCallback(
    async (normalizedName: SavedTableTarget) => {
      const record = await readTable(normalizedName);
      if (!record) return null;
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
      await putTable({ ...record, trashedAt: timestamp, updatedAt: timestamp });
      return record;
    },
    [putTable, readTable, storage.kind],
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
      const historyTarget = { ...reference, scope: target.scope };

      await Promise.all([deleteAllVersions(historyTarget), deleteAllReviews(historyTarget)]);
      await deleteSavedTable(reference, target.scope);
      if (target.kind === 'ydoc') {
        target.transact((doc) => deleteSavedTableFromYDoc(doc, reference));
      }
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
    replaceTable,
    moveTableToTrash,
    cleanupLocalTable,
    deleteTablePermanently,
  };
}
