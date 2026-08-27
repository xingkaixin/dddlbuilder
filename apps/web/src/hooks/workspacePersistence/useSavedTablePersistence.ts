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
} from '@/utils/savedTablesDb';
import type { SavedTableRecord } from '@/utils/workspaceStorageTypes';
import { useWorkspaceAuthority } from './useWorkspaceAuthority';

export function useSavedTablePersistence() {
  const authority = useWorkspaceAuthority();
  const { storage } = authority;

  const readTable = useCallback(
    (normalizedName: SavedTableTarget) =>
      storage.read({
        yDoc: (doc) => getSavedTableFromYDoc(doc, normalizedName),
        local: (scope) => getSavedTable(normalizedName, scope),
      }),
    [storage],
  );

  const readAllTables = useCallback(
    () =>
      storage.read({
        yDoc: (doc) => ({
          active: listSavedTableRecordsFromYDoc(doc),
          trashed: listTrashedSavedTableRecordsFromYDoc(doc),
        }),
        local: (scope) =>
          Promise.all([listSavedTables(scope), listTrashedSavedTables(scope)]).then(
            ([active, trashed]) => ({ active, trashed }),
          ),
      }),
    [storage],
  );

  const putTable = useCallback(
    async (record: SavedTableRecord, mode: 'add' | 'update' = 'update') => {
      await storage.write({
        yDoc: (doc) => upsertSavedTableInYDoc(doc, record),
        local: (scope) =>
          mode === 'add' ? addSavedTable(record, scope) : updateSavedTable(record, scope),
      });
    },
    [storage],
  );

  const putTables = useCallback(
    async (records: SavedTableRecord[]) => {
      await storage.write({
        yDoc: (doc) => {
          for (const record of records) upsertSavedTableInYDoc(doc, record);
        },
        local: (scope) => updateSavedTables(records, scope),
      });
    },
    [storage],
  );

  const replaceTable = useCallback(
    async (previousNormalizedName: string, record: SavedTableRecord) => {
      await storage.write({
        yDoc: (doc) => renameSavedTableInYDoc(doc, previousNormalizedName, record),
        local: async (scope) => {
          if (record.normalizedName === previousNormalizedName) {
            await updateSavedTable(record, scope);
            return;
          }
          await addSavedTable(record, scope);
          await deleteSavedTable(previousNormalizedName, scope);
        },
      });
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
    (normalizedName: SavedTableTarget) =>
      storage.cleanupLocal((scope) => deleteSavedTable(normalizedName, scope)),
    [storage],
  );

  const deleteTableEverywhere = useCallback(
    (normalizedName: SavedTableTarget) =>
      storage.removeEverywhere({
        yDoc: (doc) => deleteSavedTableFromYDoc(doc, normalizedName),
        local: (scope) => deleteSavedTable(normalizedName, scope),
      }),
    [storage],
  );

  return {
    ...authority,
    readTable,
    readAllTables,
    putTable,
    putTables,
    replaceTable,
    moveTableToTrash,
    cleanupLocalTable,
    deleteTableEverywhere,
  };
}
