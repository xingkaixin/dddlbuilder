import { useCallback, useRef } from 'react';
import type { SavedTableDraftRecord, WorkspaceScope } from '@ddlbuilder/shared-types/workspace';
import type { useWorkspaceYDocGateway } from '@/hooks/useWorkspaceYDocGateway';
import { deleteSavedDraftFromYDoc, upsertSavedDraftInYDoc } from '@/services/workspaceYDocAdapter';
import { deleteSavedDraft, renameSavedDraftKey, upsertSavedDraft } from '@/utils/workspaceStateDb';
import type { usePersistenceQueue } from './usePersistenceQueue';

interface UseSavedTableDraftRecordsParams {
  currentScope: WorkspaceScope;
  disabled: boolean;
  persistLocally: boolean;
  enqueuePersistence: ReturnType<typeof usePersistenceQueue>['enqueue'];
  runInYDoc: ReturnType<typeof useWorkspaceYDocGateway>['runInYDoc'];
}

export function useSavedTableDraftRecords({
  currentScope,
  disabled,
  persistLocally,
  enqueuePersistence,
  runInYDoc,
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
      if (persistLocally) {
        enqueuePersistence(`saved-draft:${normalizedName}`, 'save saved-table draft', () =>
          upsertSavedDraft(normalizedName, record, currentScope),
        );
      }
      runInYDoc((doc) =>
        upsertSavedDraftInYDoc(doc, normalizedName, record, { compactSnapshotBase: true }),
      );
    },
    [currentScope, enqueuePersistence, persistLocally, runInYDoc],
  );

  const dropRecord = useCallback(
    (normalizedName: string) => {
      recordsRef.current.delete(normalizedName);
      enqueuePersistence(`saved-draft:${normalizedName}`, 'delete saved-table draft', () =>
        deleteSavedDraft(normalizedName, currentScope),
      );
      runInYDoc((doc) => deleteSavedDraftFromYDoc(doc, normalizedName));
    },
    [currentScope, enqueuePersistence, runInYDoc],
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
      if (record) {
        const nextRecord = { ...record, tableName: nextTableName, updatedAt: Date.now() };
        recordsRef.current.set(toNormalizedName, nextRecord);
        if (keyChanged) recordsRef.current.delete(fromNormalizedName);
        runInYDoc((doc) => {
          upsertSavedDraftInYDoc(doc, toNormalizedName, nextRecord, { compactSnapshotBase: true });
          if (keyChanged) deleteSavedDraftFromYDoc(doc, fromNormalizedName);
        });
      }
      if (persistLocally) {
        enqueuePersistence(`saved-draft:${fromNormalizedName}`, 'rename saved-table draft', () =>
          renameSavedDraftKey(fromNormalizedName, toNormalizedName, nextTableName, currentScope),
        );
      } else if (keyChanged) {
        enqueuePersistence(`saved-draft:${fromNormalizedName}`, 'delete legacy saved draft', () =>
          deleteSavedDraft(fromNormalizedName, currentScope),
        );
      }
    },
    [currentScope, disabled, enqueuePersistence, persistLocally, runInYDoc],
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
