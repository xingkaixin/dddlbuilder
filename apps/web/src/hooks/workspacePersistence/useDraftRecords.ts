import { useCallback, useMemo, useRef, useState } from 'react';
import type * as Y from 'yjs';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { DraftSummary } from '@ddlbuilder/shared-types/workspace';
import {
  deleteDraftFromYDoc,
  getDraftRecordFromYDoc,
  listDraftRecordsFromYDoc,
  listAllDraftRecordsFromYDoc,
  upsertDraftInYDoc,
} from '@/services/workspaceYDocAdapter';
import { useWorkspaceYDocProjection } from '@/hooks/useWorkspaceYDocProjection';
import {
  deleteDraft,
  listDrafts,
  listTrashedDrafts,
  readDraft,
  writeDraft,
} from '@/utils/workspaceStateDb';
import {
  buildPersistedStateSignature,
  buildSchemaStateSignature,
} from '@/utils/persistedStateSignature';
import { getDraftDisplayName, resolveUniqueDraftName, type GlobalDraftRecord } from './normalize';
import { toDraftSummary, type DraftEntry } from './hydration';
import type { usePersistenceQueue } from './usePersistenceQueue';
import {
  requireReadyWorkspaceStorage,
  type WorkspaceStorageTarget,
} from './useWorkspaceStorageTarget';

const DRAFT_COLLECTIONS = ['drafts'] as const;
const EMPTY_DRAFTS: DraftEntry[] = [];
const sortDraftSummaries = (drafts: DraftSummary[]) =>
  drafts.sort((a, b) => b.createdAt - a.createdAt || a.draftId.localeCompare(b.draftId));
type UseDraftRecordsParams = {
  yDoc: Y.Doc | null;
  disabled: boolean;
  enqueuePersistence: ReturnType<typeof usePersistenceQueue>['enqueue'];
  storage: WorkspaceStorageTarget;
};

export function useDraftRecords({
  disabled,
  enqueuePersistence,
  storage,
  yDoc,
}: UseDraftRecordsParams) {
  const [localRecords, setLocalRecords] = useState<Map<string, GlobalDraftRecord>>(() => new Map());
  const localRecordsRef = useRef(localRecords);
  const yDocDrafts = useWorkspaceYDocProjection(
    yDoc,
    DRAFT_COLLECTIONS,
    listAllDraftRecordsFromYDoc,
    EMPTY_DRAFTS,
  );
  const { draftSummaries, trashedDrafts } = useMemo(() => {
    const records = yDoc
      ? yDocDrafts
      : Array.from(localRecords, ([draftId, record]) => ({ draftId, record }));
    const draftSummaries: DraftSummary[] = [];
    const trashedDrafts: DraftSummary[] = [];
    for (const { draftId, record } of records) {
      const summary = toDraftSummary(draftId, record);
      if (record.trashedAt == null) draftSummaries.push(summary);
      else trashedDrafts.push(summary);
    }
    return {
      draftSummaries: sortDraftSummaries(draftSummaries),
      trashedDrafts: trashedDrafts.sort((a, b) => (b.trashedAt ?? 0) - (a.trashedAt ?? 0)),
    };
  }, [localRecords, yDoc, yDocDrafts]);

  const updateLocalRecord = useCallback((draftId: string, record: GlobalDraftRecord | null) => {
    const next = new Map(localRecordsRef.current);
    if (record) next.set(draftId, record);
    else next.delete(draftId);
    localRecordsRef.current = next;
    setLocalRecords(next);
  }, []);

  const replaceLocalRecords = useCallback(
    (drafts: DraftEntry[], trashed: boolean) => {
      if (yDoc) return;
      const next = new Map(
        [...localRecordsRef.current].filter(([, record]) => (record.trashedAt != null) !== trashed),
      );
      for (const { draftId, record } of drafts) next.set(draftId, record);
      localRecordsRef.current = next;
      setLocalRecords(next);
    },
    [yDoc],
  );
  const replaceDrafts = useCallback(
    (drafts: DraftEntry[]) => replaceLocalRecords(drafts, false),
    [replaceLocalRecords],
  );
  const replaceTrashedDrafts = useCallback(
    (drafts: DraftEntry[]) => replaceLocalRecords(drafts, true),
    [replaceLocalRecords],
  );
  const refreshDrafts = useCallback(async () => {
    if (disabled || storage.kind !== 'indexeddb') return;
    const [drafts, trashed] = await Promise.all([
      listDrafts(storage.scope),
      listTrashedDrafts(storage.scope),
    ]);
    replaceDrafts(drafts);
    replaceTrashedDrafts(trashed);
  }, [disabled, replaceDrafts, replaceTrashedDrafts, storage]);
  const getRecord = useCallback(
    (draftId: string) =>
      yDoc ? getDraftRecordFromYDoc(yDoc, draftId) : localRecordsRef.current.get(draftId),
    [yDoc],
  );
  const getDraftState = useCallback(
    (draftId: string) => {
      const record = getRecord(draftId);
      return record?.trashedAt == null ? (record?.state ?? null) : null;
    },
    [getRecord],
  );

  const persistRecord = useCallback(
    (draftId: string, record: GlobalDraftRecord, operation: string) => {
      if (storage.kind === 'loading') {
        updateLocalRecord(draftId, record);
        return;
      }
      const target = storage;
      if (target.kind === 'ydoc') {
        target.transact((doc) =>
          upsertDraftInYDoc(doc, draftId, record, { compactSnapshotBase: true }),
        );
        return;
      }
      updateLocalRecord(draftId, record);
      void enqueuePersistence(`draft:${draftId}`, operation, () =>
        writeDraft(draftId, record, target.scope),
      );
    },
    [enqueuePersistence, storage, updateLocalRecord],
  );

  const saveDraftState = useCallback(
    (draftId: string, state: PersistedState) => {
      if (disabled) return;
      const existing = getRecord(draftId);
      if (existing) {
        const buildSignature = yDoc ? buildSchemaStateSignature : buildPersistedStateSignature;
        if (buildSignature(existing.state) === buildSignature(state)) return;
      }
      persistRecord(
        draftId,
        {
          createdAt: existing?.createdAt ?? Date.now(),
          updatedAt: Date.now(),
          state,
          folderId: existing?.folderId,
        },
        'save draft',
      );
    },
    [disabled, getRecord, persistRecord, yDoc],
  );

  const resolveDraftNameConflict = useCallback(
    (state: PersistedState) => {
      const records = yDoc
        ? listDraftRecordsFromYDoc(yDoc).map(({ record }) => record)
        : [...localRecordsRef.current.values()].filter((record) => record.trashedAt == null);
      const takenNames = new Set(records.map((record) => getDraftDisplayName(record.state)));
      const baseName = getDraftDisplayName(state);
      const uniqueName = resolveUniqueDraftName(baseName, takenNames);
      return {
        uniqueName,
        state: uniqueName === baseName ? state : { ...state, tableName: uniqueName },
      };
    },
    [yDoc],
  );

  const createDraft = useCallback(
    (draftId: string, state: PersistedState): string => {
      if (disabled) return getDraftDisplayName(state);
      const resolved = resolveDraftNameConflict(state);
      const now = Date.now();
      persistRecord(
        draftId,
        { createdAt: now, updatedAt: now, state: resolved.state },
        'create draft',
      );
      return resolved.uniqueName;
    },
    [disabled, persistRecord, resolveDraftNameConflict],
  );

  const moveDraftToTrash = useCallback(
    (draftId: string) => {
      if (disabled) return false;
      const record = getRecord(draftId);
      if (!record || record.trashedAt != null) return false;
      const now = Date.now();
      persistRecord(draftId, { ...record, updatedAt: now, trashedAt: now }, 'move draft to trash');
      return true;
    },
    [disabled, getRecord, persistRecord],
  );

  const restoreDraftById = useCallback(
    async (draftId: string) => {
      if (disabled) return;
      const target = requireReadyWorkspaceStorage(storage);
      const record = getRecord(draftId) ?? (await readDraft(draftId, target.scope));
      if (!record) return;
      const restored = {
        ...record,
        state: resolveDraftNameConflict(record.state).state,
        updatedAt: Date.now(),
        trashedAt: undefined,
      };
      if (target.kind === 'ydoc') persistRecord(draftId, restored, 'restore draft');
      else {
        await enqueuePersistence(`draft:${draftId}`, 'restore draft', () =>
          writeDraft(draftId, restored, target.scope),
        );
        updateLocalRecord(draftId, restored);
      }
      if (target.kind === 'ydoc') {
        void enqueuePersistence(`draft-cleanup:${draftId}`, 'clean up restored draft', () =>
          deleteDraft(draftId, target.scope),
        );
      }
    },
    [
      disabled,
      enqueuePersistence,
      getRecord,
      persistRecord,
      resolveDraftNameConflict,
      storage,
      updateLocalRecord,
    ],
  );

  const permanentlyDeleteDraftById = useCallback(
    async (draftId: string) => {
      if (disabled) return;
      const target = requireReadyWorkspaceStorage(storage);
      if (target.kind === 'ydoc') {
        target.transact((doc) => deleteDraftFromYDoc(doc, draftId));
      }
      await enqueuePersistence(`draft:${draftId}`, 'permanently delete draft', () =>
        deleteDraft(draftId, target.scope),
      );
      if (target.kind === 'indexeddb') updateLocalRecord(draftId, null);
    },
    [disabled, enqueuePersistence, storage, updateLocalRecord],
  );

  const moveDraftToFolder = useCallback(
    (draftId: string, folderId?: string) => {
      if (disabled) return;
      const record = getRecord(draftId);
      if (record)
        persistRecord(
          draftId,
          { ...record, folderId, updatedAt: Date.now() },
          'move draft to folder',
        );
    },
    [disabled, getRecord, persistRecord],
  );

  return {
    draftSummaries,
    trashedDrafts,
    refreshDrafts,
    replaceDrafts,
    replaceTrashedDrafts,
    getDraftState,
    saveDraftState,
    createDraft,
    moveDraftToTrash,
    restoreDraftById,
    permanentlyDeleteDraftById,
    moveDraftToFolder,
  };
}
