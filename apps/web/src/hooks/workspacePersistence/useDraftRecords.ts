import { useCallback, useRef, useState } from 'react';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { DraftSummary } from '@ddlbuilder/shared-types/workspace';
import { deleteDraftFromYDoc, upsertDraftInYDoc } from '@/services/workspaceYDocAdapter';
import { deleteDraft, readDraft, writeDraft } from '@/utils/workspaceStateDb';
import { serializePersistedStateForComparison } from '@/utils/persistedStateSignature';
import { getDraftDisplayName, resolveUniqueDraftName, type GlobalDraftRecord } from './normalize';
import { toDraftSummary, type DraftEntry } from './hydration';
import type { usePersistenceQueue } from './usePersistenceQueue';
import type { WorkspaceStorageTarget } from './useWorkspaceStorageTarget';

const sortDraftSummaries = (drafts: DraftSummary[]) =>
  [...drafts].sort((a, b) => b.createdAt - a.createdAt || a.draftId.localeCompare(b.draftId));

const isSameState = (left: PersistedState, right: PersistedState) =>
  serializePersistedStateForComparison(left) === serializePersistedStateForComparison(right);

interface UseDraftRecordsParams {
  disabled: boolean;
  enqueuePersistence: ReturnType<typeof usePersistenceQueue>['enqueue'];
  storage: WorkspaceStorageTarget;
}

export function useDraftRecords({ disabled, enqueuePersistence, storage }: UseDraftRecordsParams) {
  const [draftRecords, setDraftRecords] = useState<Map<string, GlobalDraftRecord>>(() => new Map());
  const recordsRef = useRef(draftRecords);
  const trashedRecordsRef = useRef<Map<string, GlobalDraftRecord>>(new Map());
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
    trashedRecordsRef.current = new Map(drafts.map(({ draftId, record }) => [draftId, record]));
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
    (draftId: string, record: GlobalDraftRecord) =>
      storage.write({
        yDoc: (doc) => upsertDraftInYDoc(doc, draftId, record, { compactSnapshotBase: true }),
        local: (scope) => writeDraft(draftId, record, scope),
      }),
    [storage],
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
      console.info(
        JSON.stringify({
          event: 'workspace_trash_write',
          entityType: 'draft',
          draftId,
          target: storage.kind,
          yDocReady: storage.kind === 'ydoc',
        }),
      );
      removeDraftRecord(draftId);
      trashedRecordsRef.current.set(draftId, trashedRecord);
      setTrashedDrafts((previous) => [toDraftSummary(draftId, trashedRecord), ...previous]);
      enqueuePersistence(`draft:${draftId}`, 'move draft to trash', () =>
        persistDraftRecord(draftId, trashedRecord),
      );
      return true;
    },
    [disabled, enqueuePersistence, persistDraftRecord, removeDraftRecord, storage.kind],
  );

  const restoreDraftById = useCallback(
    async (draftId: string) => {
      if (disabled) return;
      const record =
        trashedRecordsRef.current.get(draftId) ??
        (await storage.readLocal((scope) => readDraft(draftId, scope)));
      if (!record) return;
      const restoredRecord: GlobalDraftRecord = {
        ...record,
        state: resolveDraftNameConflict(record.state).state,
        updatedAt: Date.now(),
        trashedAt: undefined,
      };
      setTrashedDrafts((previous) => previous.filter((draft) => draft.draftId !== draftId));
      trashedRecordsRef.current.delete(draftId);
      cacheDraftRecord(draftId, restoredRecord);
      await persistDraftRecord(draftId, restoredRecord);
      await storage.cleanupLocal((scope) => deleteDraft(draftId, scope));
    },
    [cacheDraftRecord, disabled, persistDraftRecord, resolveDraftNameConflict, storage],
  );

  const permanentlyDeleteDraftById = useCallback(
    (draftId: string) => {
      if (disabled) return;
      setTrashedDrafts((previous) => previous.filter((draft) => draft.draftId !== draftId));
      trashedRecordsRef.current.delete(draftId);
      enqueuePersistence(`draft:${draftId}`, 'permanently delete draft', () =>
        storage.removeEverywhere({
          yDoc: (doc) => deleteDraftFromYDoc(doc, draftId),
          local: (scope) => deleteDraft(draftId, scope),
        }),
      );
    },
    [disabled, enqueuePersistence, storage],
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
        storage.removeEverywhere({
          yDoc: (doc) => deleteDraftFromYDoc(doc, draftId),
          local: (scope) => deleteDraft(draftId, scope),
        }),
      );
    },
    [enqueuePersistence, removeDraftRecord, storage],
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
