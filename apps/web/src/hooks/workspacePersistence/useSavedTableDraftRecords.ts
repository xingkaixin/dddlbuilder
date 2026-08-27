import {
  savedTableReference,
  savedTableKey,
  type SavedTableTarget,
} from '@ddlbuilder/shared-types/workspace';
import { useCallback, useRef } from 'react';
import type { SavedTableDraftRecord } from '@ddlbuilder/shared-types/workspace';
import {
  deleteSavedDraftFromYDoc,
  upsertSavedDraftInYDoc,
  renameSavedDraftInYDoc,
} from '@/services/workspaceYDocAdapter';
import { deleteSavedDraft, renameSavedDraftKey, upsertSavedDraft } from '@/utils/workspaceStateDb';
import type { usePersistenceQueue } from './usePersistenceQueue';
import type { WorkspaceStorageTarget } from './useWorkspaceStorageTarget';

interface UseSavedTableDraftRecordsParams {
  disabled: boolean;
  enqueuePersistence: ReturnType<typeof usePersistenceQueue>['enqueue'];
  storage: WorkspaceStorageTarget;
}

export function useSavedTableDraftRecords({
  disabled,
  enqueuePersistence,
  storage,
}: UseSavedTableDraftRecordsParams) {
  const recordsRef = useRef<Map<string, SavedTableDraftRecord>>(new Map());

  const replaceRecords = useCallback((records: Map<string, SavedTableDraftRecord>) => {
    recordsRef.current = new Map(
      Array.from(records, ([key, record]) => [record.tableId ?? key, record]),
    );
  }, []);

  const getRecord = useCallback((target: SavedTableTarget) => {
    const { normalizedName, tableId } = savedTableReference(target);
    const record = recordsRef.current.get(savedTableKey(target));
    if (record) return record;
    const legacy = recordsRef.current.get(normalizedName);
    return legacy && (!legacy.tableId || legacy.tableId === tableId) ? legacy : null;
  }, []);

  const persistRecord = useCallback(
    (target: SavedTableTarget, record: SavedTableDraftRecord) => {
      const { normalizedName, tableId } = savedTableReference(target);
      const key = savedTableKey(target);
      if (key !== normalizedName && !recordsRef.current.get(normalizedName)?.tableId) {
        recordsRef.current.delete(normalizedName);
      }
      recordsRef.current.set(key, { ...record, ...(tableId ? { tableId } : {}) });
      void enqueuePersistence(`saved-draft:${key}`, 'save saved-table draft', () =>
        storage.write({
          yDoc: (doc) =>
            upsertSavedDraftInYDoc(doc, target, record, {
              compactSnapshotBase: true,
            }),
          local: (scope) =>
            upsertSavedDraft(normalizedName, { ...record, ...(tableId ? { tableId } : {}) }, scope),
        }),
      );
    },
    [enqueuePersistence, storage],
  );

  const dropRecord = useCallback(
    (target: SavedTableTarget) => {
      const { normalizedName } = savedTableReference(target);
      const key = savedTableKey(target);
      recordsRef.current.delete(key);
      if (key !== normalizedName && !recordsRef.current.get(normalizedName)?.tableId) {
        recordsRef.current.delete(normalizedName);
      }
      void enqueuePersistence(`saved-draft:${key}`, 'delete saved-table draft', () =>
        storage.removeEverywhere({
          yDoc: (doc) => deleteSavedDraftFromYDoc(doc, target),
          local: (scope) => deleteSavedDraft(normalizedName, scope),
        }),
      );
    },
    [enqueuePersistence, storage],
  );

  const removeRecord = useCallback(
    (target: SavedTableTarget) => {
      if (!disabled) dropRecord(target);
    },
    [disabled, dropRecord],
  );

  const renameRecord = useCallback(
    (target: SavedTableTarget, toNormalizedName: string, nextTableName: string) => {
      const { normalizedName: fromNormalizedName, tableId } = savedTableReference(target);
      const oldKey = savedTableKey(target);
      const newKey = tableId ?? toNormalizedName;
      if (disabled) return;
      const record = getRecord(target);
      const keyChanged = fromNormalizedName !== toNormalizedName;
      if (record) {
        const nextRecord = {
          ...record,
          ...(tableId ? { tableId } : {}),
          tableName: nextTableName,
          updatedAt: Date.now(),
        };
        recordsRef.current.set(newKey, nextRecord);
        if (oldKey !== newKey) recordsRef.current.delete(oldKey);
        if (oldKey !== fromNormalizedName && !record.tableId)
          recordsRef.current.delete(fromNormalizedName);
      }
      void enqueuePersistence(`saved-draft:${oldKey}`, 'rename saved-table draft', async () => {
        await storage.write({
          yDoc: (doc) => renameSavedDraftInYDoc(doc, target, toNormalizedName, nextTableName),
          local: (scope) =>
            renameSavedDraftKey(fromNormalizedName, toNormalizedName, nextTableName, scope),
        });
        if (keyChanged) {
          await storage.cleanupLocal((scope) => deleteSavedDraft(fromNormalizedName, scope));
        }
      });
    },
    [disabled, enqueuePersistence, getRecord, storage],
  );

  return {
    replaceSavedTableDrafts: replaceRecords,
    getSavedTableDraft: getRecord,
    persistSavedTableDraft: persistRecord,
    dropSavedTableDraft: dropRecord,
    removeSavedTableDraft: removeRecord,
    renameSavedTableDraft: renameRecord,
  };
}
