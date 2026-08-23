import { useCallback } from 'react';
import {
  deleteSavedTableFromYDoc,
  getSavedTableFromYDoc,
  listSavedTableRecordsFromYDoc,
  listTrashedSavedTableRecordsFromYDoc,
  upsertSavedTableInYDoc,
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
  const { scope, yDoc, runInYDoc, writeLocalFallback } = authority;
  const requireScope = useCallback(() => {
    if (!scope) throw new Error('工作区未就绪');
    return scope;
  }, [scope]);

  const readTable = useCallback(
    (normalizedName: string) =>
      yDoc
        ? Promise.resolve(getSavedTableFromYDoc(yDoc, normalizedName))
        : getSavedTable(normalizedName, requireScope()),
    [requireScope, yDoc],
  );

  const readAllTables = useCallback(
    () =>
      yDoc
        ? Promise.resolve({
            active: listSavedTableRecordsFromYDoc(yDoc),
            trashed: listTrashedSavedTableRecordsFromYDoc(yDoc),
          })
        : Promise.all([
            listSavedTables(requireScope()),
            listTrashedSavedTables(requireScope()),
          ]).then(([active, trashed]) => ({ active, trashed })),
    [requireScope, yDoc],
  );

  const putTable = useCallback(
    async (record: SavedTableRecord, mode: 'add' | 'update' = 'update') => {
      if (yDoc) {
        runInYDoc((doc) => upsertSavedTableInYDoc(doc, record));
        return;
      }
      const currentScope = requireScope();
      await writeLocalFallback(() =>
        mode === 'add'
          ? addSavedTable(record, currentScope)
          : updateSavedTable(record, currentScope),
      );
    },
    [requireScope, runInYDoc, writeLocalFallback, yDoc],
  );

  const putTables = useCallback(
    async (records: SavedTableRecord[]) => {
      if (yDoc) {
        runInYDoc((doc) => {
          for (const record of records) upsertSavedTableInYDoc(doc, record);
        });
        return;
      }
      const currentScope = requireScope();
      await writeLocalFallback(() => updateSavedTables(records, currentScope));
    },
    [requireScope, runInYDoc, writeLocalFallback, yDoc],
  );

  const replaceTable = useCallback(
    async (previousNormalizedName: string, record: SavedTableRecord) => {
      if (yDoc) {
        runInYDoc((doc) => {
          upsertSavedTableInYDoc(doc, record);
          if (record.normalizedName !== previousNormalizedName) {
            deleteSavedTableFromYDoc(doc, previousNormalizedName);
          }
        });
        return;
      }
      const currentScope = requireScope();
      await writeLocalFallback(async () => {
        if (record.normalizedName === previousNormalizedName) {
          await updateSavedTable(record, currentScope);
          return;
        }
        await addSavedTable(record, currentScope);
        await deleteSavedTable(previousNormalizedName, currentScope);
      });
    },
    [requireScope, runInYDoc, writeLocalFallback, yDoc],
  );

  return { ...authority, readTable, readAllTables, putTable, putTables, replaceTable };
}
