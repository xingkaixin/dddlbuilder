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
    recordsRef.current = records;
  }, []);

  const getRecord = useCallback(
    (normalizedName: string) => recordsRef.current.get(normalizedName) ?? null,
    [],
  );

  const persistRecord = useCallback(
    (normalizedName: string, record: SavedTableDraftRecord) => {
      recordsRef.current.set(normalizedName, record);
      void enqueuePersistence(`saved-draft:${normalizedName}`, 'save saved-table draft', () =>
        storage.write({
          yDoc: (doc) =>
            upsertSavedDraftInYDoc(doc, normalizedName, record, {
              compactSnapshotBase: true,
            }),
          local: (scope) => upsertSavedDraft(normalizedName, record, scope),
        }),
      );
    },
    [enqueuePersistence, storage],
  );

  const dropRecord = useCallback(
    (normalizedName: string) => {
      recordsRef.current.delete(normalizedName);
      void enqueuePersistence(`saved-draft:${normalizedName}`, 'delete saved-table draft', () =>
        storage.removeEverywhere({
          yDoc: (doc) => deleteSavedDraftFromYDoc(doc, normalizedName),
          local: (scope) => deleteSavedDraft(normalizedName, scope),
        }),
      );
    },
    [enqueuePersistence, storage],
  );

  const removeRecord = useCallback(
    (normalizedName: string) => {
      if (!disabled) dropRecord(normalizedName);
    },
    [disabled, dropRecord],
  );

  const renameRecord = useCallback(
    (fromNormalizedName: string, toNormalizedName: string, nextTableName: string) => {
      if (disabled) return;
      const record = recordsRef.current.get(fromNormalizedName);
      const keyChanged = fromNormalizedName !== toNormalizedName;
      let nextRecord: SavedTableDraftRecord | null = null;
      if (record) {
        nextRecord = { ...record, tableName: nextTableName, updatedAt: Date.now() };
        recordsRef.current.set(toNormalizedName, nextRecord);
        if (keyChanged) recordsRef.current.delete(fromNormalizedName);
      }
      void enqueuePersistence(
        `saved-draft:${fromNormalizedName}`,
        'rename saved-table draft',
        async () => {
          await storage.write({
            yDoc: (doc) =>
              renameSavedDraftInYDoc(doc, fromNormalizedName, toNormalizedName, nextTableName),
            local: (scope) =>
              renameSavedDraftKey(fromNormalizedName, toNormalizedName, nextTableName, scope),
          });
          if (keyChanged) {
            await storage.cleanupLocal((scope) => deleteSavedDraft(fromNormalizedName, scope));
          }
        },
      );
    },
    [disabled, enqueuePersistence, storage],
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
