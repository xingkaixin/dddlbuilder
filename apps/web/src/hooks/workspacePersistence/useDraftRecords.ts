import { useCallback, useRef, useState } from 'react';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { DraftSummary, WorkspaceScope } from '@ddlbuilder/shared-types/workspace';
import type { useWorkspaceYDocGateway } from '@/hooks/useWorkspaceYDocGateway';
import { deleteDraftFromYDoc, upsertDraftInYDoc } from '@/services/workspaceYDocAdapter';
import { deleteDraft, readDraft, writeDraft } from '@/utils/workspaceStateDb';
import { serializePersistedStateForComparison } from '@/utils/persistedStateSignature';
import { getDraftDisplayName, resolveUniqueDraftName, type GlobalDraftRecord } from './normalize';
import { toDraftSummary, type DraftEntry } from './hydration';
import type { usePersistenceQueue } from './usePersistenceQueue';

const sortDraftSummaries = (drafts: DraftSummary[]) =>
  [...drafts].sort((a, b) => b.createdAt - a.createdAt || a.draftId.localeCompare(b.draftId));

const isSameState = (left: PersistedState, right: PersistedState) =>
  serializePersistedStateForComparison(left) === serializePersistedStateForComparison(right);

interface UseDraftRecordsParams {
  currentScope: WorkspaceScope;
  disabled: boolean;
  persistLocally: boolean;
  enqueuePersistence: ReturnType<typeof usePersistenceQueue>['enqueue'];
  runInYDoc: ReturnType<typeof useWorkspaceYDocGateway>['runInYDoc'];
}

export function useDraftRecords({
  currentScope,
  disabled,
  persistLocally,
  enqueuePersistence,
  runInYDoc,
}: UseDraftRecordsParams) {
  const [draftRecords, setDraftRecords] = useState<Map<string, GlobalDraftRecord>>(() => new Map());
  const recordsRef = useRef(draftRecords);
  const [trashedDrafts, setTrashedDrafts] = useState<DraftSummary[]>([]);
  const draftSummaries = sortDraftSummaries(
    Array.from(draftRecords, ([draftId, record]) => toDraftSummary(draftId, record)),
  );

  const cacheDraftRecord = useCallback((draftId: string, record: GlobalDraftRecord) => {
    const nextRecords = new Map(recordsRef.current).set(draftId, record);
    recordsRef.current = nextRecords;
    setDraftRecords(nextRecords);
  }, []);

  const removeDraftRecord = useCallback((draftId: string) => {
    const nextRecords = new Map(recordsRef.current);
    nextRecords.delete(draftId);
    recordsRef.current = nextRecords;
    setDraftRecords(nextRecords);
  }, []);

  const replaceDrafts = useCallback((drafts: DraftEntry[]) => {
    const nextRecords = new Map(drafts.map(({ draftId, record }) => [draftId, record]));
    recordsRef.current = nextRecords;
    setDraftRecords(nextRecords);
  }, []);

  const replaceTrashedDrafts = useCallback((drafts: DraftEntry[]) => {
    setTrashedDrafts(drafts.map(({ draftId, record }) => toDraftSummary(draftId, record)));
  }, []);

  const getDraftState = useCallback(
    (draftId: string) => recordsRef.current.get(draftId)?.state ?? null,
    [],
  );
  const getDraftEntries = useCallback(
    (): DraftEntry[] =>
      Array.from(recordsRef.current, ([draftId, record]) => ({ draftId, record })),
    [],
  );

  const persistDraftRecord = useCallback(
    (draftId: string, record: GlobalDraftRecord) => {
      const written = persistLocally
        ? writeDraft(draftId, record, currentScope)
        : Promise.resolve();
      runInYDoc((doc) => upsertDraftInYDoc(doc, draftId, record, { compactSnapshotBase: true }));
      return written;
    },
    [currentScope, persistLocally, runInYDoc],
  );

  const dropDraftRecord = useCallback(
    (draftId: string) => runInYDoc((doc) => deleteDraftFromYDoc(doc, draftId)),
    [runInYDoc],
  );

  const saveDraftState = useCallback(
    (draftId: string, state: PersistedState) => {
      const existingRecord = recordsRef.current.get(draftId);
      if (existingRecord && isSameState(existingRecord.state, state)) return;
      const record: GlobalDraftRecord = {
        createdAt: existingRecord?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
        state,
        folderId: existingRecord?.folderId,
      };
      cacheDraftRecord(draftId, record);
      enqueuePersistence(`draft:${draftId}`, 'save draft', () =>
        persistDraftRecord(draftId, record),
      );
    },
    [cacheDraftRecord, enqueuePersistence, persistDraftRecord],
  );

  const resolveDraftNameConflict = useCallback((state: PersistedState) => {
    const takenNames = new Set(
      Array.from(recordsRef.current.values(), (record) => getDraftDisplayName(record.state)),
    );
    const baseName = getDraftDisplayName(state);
    const uniqueName = resolveUniqueDraftName(baseName, takenNames);
    return {
      uniqueName,
      state: uniqueName === baseName ? state : { ...state, tableName: uniqueName },
    };
  }, []);

  const createDraft = useCallback(
    (draftId: string, state: PersistedState): string => {
      if (disabled) return getDraftDisplayName(state);
      const resolved = resolveDraftNameConflict(state);
      const now = Date.now();
      const record: GlobalDraftRecord = {
        createdAt: now,
        updatedAt: now,
        state: resolved.state,
      };
      cacheDraftRecord(draftId, record);
      enqueuePersistence(`draft:${draftId}`, 'create draft', () =>
        persistDraftRecord(draftId, record),
      );
      return resolved.uniqueName;
    },
    [disabled, cacheDraftRecord, enqueuePersistence, persistDraftRecord, resolveDraftNameConflict],
  );

  const moveDraftToTrash = useCallback(
    (draftId: string) => {
      if (disabled) return false;
      const record = recordsRef.current.get(draftId);
      if (!record) return false;
      const now = Date.now();
      const trashedRecord: GlobalDraftRecord = { ...record, updatedAt: now, trashedAt: now };
      removeDraftRecord(draftId);
      setTrashedDrafts((previous) => [toDraftSummary(draftId, trashedRecord), ...previous]);
      enqueuePersistence(`draft:${draftId}`, 'move draft to trash', () =>
        writeDraft(draftId, trashedRecord, currentScope),
      );
      dropDraftRecord(draftId);
      return true;
    },
    [currentScope, disabled, dropDraftRecord, enqueuePersistence, removeDraftRecord],
  );

  const restoreDraftById = useCallback(
    async (draftId: string) => {
      if (disabled) return;
      const record = await readDraft(draftId, currentScope);
      if (!record) return;
      const restoredRecord: GlobalDraftRecord = {
        ...record,
        state: resolveDraftNameConflict(record.state).state,
        updatedAt: Date.now(),
        trashedAt: undefined,
      };
      setTrashedDrafts((previous) => previous.filter((draft) => draft.draftId !== draftId));
      cacheDraftRecord(draftId, restoredRecord);
      await persistDraftRecord(draftId, restoredRecord);
      if (!persistLocally) await deleteDraft(draftId, currentScope);
    },
    [
      cacheDraftRecord,
      currentScope,
      disabled,
      persistDraftRecord,
      persistLocally,
      resolveDraftNameConflict,
    ],
  );

  const permanentlyDeleteDraftById = useCallback(
    (draftId: string) => {
      if (disabled) return;
      setTrashedDrafts((previous) => previous.filter((draft) => draft.draftId !== draftId));
      enqueuePersistence(`draft:${draftId}`, 'permanently delete draft', () =>
        deleteDraft(draftId, currentScope),
      );
      dropDraftRecord(draftId);
    },
    [currentScope, disabled, dropDraftRecord, enqueuePersistence],
  );

  const moveDraftToFolder = useCallback(
    (draftId: string, folderId?: string) => {
      if (disabled) return;
      const record = recordsRef.current.get(draftId);
      if (!record) return;
      const updatedRecord = { ...record, folderId, updatedAt: Date.now() };
      cacheDraftRecord(draftId, updatedRecord);
      enqueuePersistence(`draft:${draftId}`, 'move draft to folder', () =>
        persistDraftRecord(draftId, updatedRecord),
      );
    },
    [cacheDraftRecord, disabled, enqueuePersistence, persistDraftRecord],
  );

  const clearDraft = useCallback(
    (draftId: string) => {
      removeDraftRecord(draftId);
      enqueuePersistence(`draft:${draftId}`, 'delete draft', () =>
        deleteDraft(draftId, currentScope),
      );
      dropDraftRecord(draftId);
    },
    [currentScope, dropDraftRecord, enqueuePersistence, removeDraftRecord],
  );

  return {
    draftSummaries,
    trashedDrafts,
    replaceDrafts,
    replaceTrashedDrafts,
    getDraftState,
    getDraftEntries,
    cacheDraftRecord,
    saveDraftState,
    createDraft,
    moveDraftToTrash,
    restoreDraftById,
    permanentlyDeleteDraftById,
    moveDraftToFolder,
    clearDraft,
  };
}
