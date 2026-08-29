import {
  savedTableReference,
  savedTableKey,
  type SavedTableTarget,
} from '@ddlbuilder/shared-types/workspace';
import { useCallback, useRef } from 'react';
import { toSchemaDocumentState, type SchemaDocumentState } from '@ddlbuilder/shared-types';
import { buildSchemaStateSignature, decodeSavedDraftBase } from '@ddlbuilder/workspace-core';
import type { SavedTableDraftRecord } from '@ddlbuilder/shared-types/workspace';
import {
  deleteSavedDraftFromYDoc,
  upsertSavedDraftInYDoc,
  renameSavedDraftInYDoc,
  getSavedTableFromYDoc,
} from '@/services/workspaceYDocAdapter';
import { deleteSavedDraft, renameSavedDraftKey, upsertSavedDraft } from '@/utils/workspaceStateDb';
import { getSavedTable } from '@/utils/savedTablesDb';
import type { usePersistenceQueue } from './usePersistenceQueue';
import {
  requireReadyWorkspaceStorage,
  type WorkspaceStorageTarget,
} from './useWorkspaceStorageTarget';

interface UseSavedTableDraftRecordsParams {
  disabled: boolean;
  enqueuePersistence: ReturnType<typeof usePersistenceQueue>['enqueue'];
  storage: WorkspaceStorageTarget;
}

const withSavedBase = (
  record: SavedTableDraftRecord,
  savedState?: SchemaDocumentState,
): SavedTableDraftRecord =>
  !record.baseState && savedState && buildSchemaStateSignature(savedState) === record.baseSignature
    ? { ...record, baseState: toSchemaDocumentState(savedState) }
    : record;

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
      const existing = recordsRef.current.get(key);
      const nextRecord = {
        ...record,
        ...decodeSavedDraftBase(record),
        ...(tableId ? { tableId } : {}),
      };
      if (!nextRecord.baseState && existing?.baseSignature === nextRecord.baseSignature)
        nextRecord.baseState = existing.baseState;
      recordsRef.current.set(key, nextRecord);
      void enqueuePersistence(`saved-draft:${key}`, 'save saved-table draft', async () => {
        const destination = requireReadyWorkspaceStorage(storage);
        if (destination.kind === 'ydoc') {
          destination.transact((doc) =>
            upsertSavedDraftInYDoc(
              doc,
              target,
              withSavedBase(nextRecord, getSavedTableFromYDoc(doc, target)?.state),
              { compactSnapshotBase: true },
            ),
          );
          return;
        }
        await upsertSavedDraft(
          normalizedName,
          withSavedBase(nextRecord, (await getSavedTable(target, destination.scope))?.state),
          destination.scope,
        );
      });
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
      void enqueuePersistence(`saved-draft:${key}`, 'delete saved-table draft', async () => {
        const destination = requireReadyWorkspaceStorage(storage);
        if (destination.kind === 'ydoc') {
          destination.transact((doc) => deleteSavedDraftFromYDoc(doc, target));
        }
        await deleteSavedDraft(normalizedName, destination.scope);
      });
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
        const destination = requireReadyWorkspaceStorage(storage);
        if (destination.kind === 'ydoc') {
          destination.transact((doc) =>
            renameSavedDraftInYDoc(doc, target, toNormalizedName, nextTableName),
          );
          if (keyChanged) await deleteSavedDraft(fromNormalizedName, destination.scope);
          return;
        }
        await renameSavedDraftKey(
          fromNormalizedName,
          toNormalizedName,
          nextTableName,
          destination.scope,
        );
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
