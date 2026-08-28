import { useCallback, useMemo, useRef, useState } from 'react';
import type * as Y from 'yjs';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { DraftSummary } from '@ddlbuilder/shared-types/workspace';
import {
  deleteDraftFromYDoc,
  getDraftRecordFromYDoc,
  listDraftRecordsFromYDoc,
  listTrashedDraftRecordsFromYDoc,
  upsertDraftInYDoc,
} from '@/services/workspaceYDocAdapter';
import { useWorkspaceYDocProjection } from '@/hooks/useWorkspaceYDocProjection';
import type { useWorkspaceYDocGateway } from '@/hooks/useWorkspaceYDocGateway';
import { deleteDraft, readDraft, writeDraft } from '@/utils/workspaceStateDb';
import { serializePersistedStateForComparison } from '@/utils/persistedStateSignature';
import { getDraftDisplayName, resolveUniqueDraftName, type GlobalDraftRecord } from './normalize';
import { toDraftSummary, type DraftEntry } from './hydration';
import type { usePersistenceQueue } from './usePersistenceQueue';
import type { WorkspaceStorageTarget } from './useWorkspaceStorageTarget';

const DRAFT_COLLECTIONS = ['drafts'] as const;
const EMPTY_DRAFTS: DraftEntry[] = [];
const readDrafts = (doc: Y.Doc) => [
  ...listDraftRecordsFromYDoc(doc),
  ...listTrashedDraftRecordsFromYDoc(doc),
];
const sortDraftSummaries = (drafts: DraftSummary[]) =>
  drafts.sort((a, b) => b.createdAt - a.createdAt || a.draftId.localeCompare(b.draftId));
const isSameState = (left: PersistedState, right: PersistedState) =>
  serializePersistedStateForComparison(left) === serializePersistedStateForComparison(right);

type UseDraftRecordsParams = Pick<
  ReturnType<typeof useWorkspaceYDocGateway>,
  'yDoc' | 'runInYDoc'
> & {
  disabled: boolean;
  enqueuePersistence: ReturnType<typeof usePersistenceQueue>['enqueue'];
  storage: WorkspaceStorageTarget;
};

export function useDraftRecords({
  disabled,
  enqueuePersistence,
  storage,
  yDoc,
  runInYDoc,
}: UseDraftRecordsParams) {
  const [localRecords, setLocalRecords] = useState<Map<string, GlobalDraftRecord>>(() => new Map());
  const localRecordsRef = useRef(localRecords);
  const yDocDrafts = useWorkspaceYDocProjection(yDoc, DRAFT_COLLECTIONS, readDrafts, EMPTY_DRAFTS);
  const { draftSummaries, trashedDrafts } = useMemo(() => {
    const records = yDoc
      ? yDocDrafts
      : Array.from(localRecords, ([draftId, record]) => ({ draftId, record }));
    return {
      draftSummaries: sortDraftSummaries(
        records
          .filter(({ record }) => record.trashedAt == null)
          .map(({ draftId, record }) => toDraftSummary(draftId, record)),
      ),
      trashedDrafts: records
        .filter(({ record }) => record.trashedAt != null)
        .map(({ draftId, record }) => toDraftSummary(draftId, record))
        .sort((a, b) => (b.trashedAt ?? 0) - (a.trashedAt ?? 0)),
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
      if (yDoc) {
        runInYDoc((doc) => upsertDraftInYDoc(doc, draftId, record, { compactSnapshotBase: true }));
        return;
      }
      updateLocalRecord(draftId, record);
      void enqueuePersistence(`draft:${draftId}`, operation, () =>
        storage.write({
          yDoc: (doc) => upsertDraftInYDoc(doc, draftId, record),
          local: (scope) => writeDraft(draftId, record, scope),
        }),
      );
    },
    [enqueuePersistence, runInYDoc, storage, updateLocalRecord, yDoc],
  );

  const saveDraftState = useCallback(
    (draftId: string, state: PersistedState) => {
      if (disabled) return;
      const existing = getRecord(draftId);
      if (existing && isSameState(existing.state, state)) return;
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
    [disabled, getRecord, persistRecord],
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
      const record =
        getRecord(draftId) ?? (await storage.readLocal((scope) => readDraft(draftId, scope)));
      if (!record) return;
      const restored = {
        ...record,
        state: resolveDraftNameConflict(record.state).state,
        updatedAt: Date.now(),
        trashedAt: undefined,
      };
      if (yDoc) persistRecord(draftId, restored, 'restore draft');
      else {
        await enqueuePersistence(`draft:${draftId}`, 'restore draft', () =>
          storage.write({
            yDoc: (doc) => upsertDraftInYDoc(doc, draftId, restored),
            local: (scope) => writeDraft(draftId, restored, scope),
          }),
        );
        updateLocalRecord(draftId, restored);
      }
      void enqueuePersistence(`draft-cleanup:${draftId}`, 'clean up restored draft', () =>
        storage.cleanupLocal((scope) => deleteDraft(draftId, scope)),
      );
    },
    [
      disabled,
      enqueuePersistence,
      getRecord,
      persistRecord,
      resolveDraftNameConflict,
      storage,
      updateLocalRecord,
      yDoc,
    ],
  );

  const permanentlyDeleteDraftById = useCallback(
    async (draftId: string) => {
      if (disabled) return;
      if (yDoc) runInYDoc((doc) => deleteDraftFromYDoc(doc, draftId));
      await enqueuePersistence(`draft:${draftId}`, 'permanently delete draft', () =>
        yDoc
          ? storage.cleanupLocal((scope) => deleteDraft(draftId, scope))
          : storage.removeEverywhere({
              yDoc: (doc) => deleteDraftFromYDoc(doc, draftId),
              local: (scope) => deleteDraft(draftId, scope),
            }),
      );
      if (!yDoc) updateLocalRecord(draftId, null);
    },
    [disabled, enqueuePersistence, runInYDoc, storage, updateLocalRecord, yDoc],
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

  const clearDraft = useCallback(
    (draftId: string) => {
      if (yDoc) runInYDoc((doc) => deleteDraftFromYDoc(doc, draftId));
      else updateLocalRecord(draftId, null);
      void enqueuePersistence(`draft:${draftId}`, 'delete draft', () =>
        yDoc
          ? storage.cleanupLocal((scope) => deleteDraft(draftId, scope))
          : storage.removeEverywhere({
              yDoc: (doc) => deleteDraftFromYDoc(doc, draftId),
              local: (scope) => deleteDraft(draftId, scope),
            }),
      );
    },
    [enqueuePersistence, runInYDoc, storage, updateLocalRecord, yDoc],
  );

  return {
    draftSummaries,
    trashedDrafts,
    replaceDrafts,
    replaceTrashedDrafts,
    getDraftState,
    saveDraftState,
    createDraft,
    moveDraftToTrash,
    restoreDraftById,
    permanentlyDeleteDraftById,
    moveDraftToFolder,
    clearDraft,
  };
}
