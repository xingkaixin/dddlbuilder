import { useEffect } from 'react';
import type * as Y from 'yjs';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { SavedTableDraftRecord, WorkspaceSelection } from '@ddlbuilder/shared-types/workspace';
import type { useWorkspaceYDocGateway } from '@/hooks/useWorkspaceYDocGateway';
import {
  getDraftRecordFromYDoc,
  getSavedDraftFromYDoc,
  getSavedTableFromYDoc,
  getStateForWorkspaceSource,
  listDraftRecordsFromYDoc,
  listSavedDraftsFromYDoc,
  listTrashedDraftRecordsFromYDoc,
  subscribeWorkspaceYDoc,
  type WorkspaceYDocChange,
  WORKSPACE_YDOC_LOCAL_EDIT_ORIGIN,
  upsertDraftInYDoc,
} from '@/services/workspaceYDocAdapter';
import { serializePersistedStateForComparison } from '@/utils/persistedStateSignature';
import { pickInitialDraft, type DraftEntry } from './hydration';
import { mergeLocalDraftChanges } from './mergeLocalEdits';
import { isSameWorkspaceSource, type GlobalDraftRecord } from './normalize';

export interface PendingLocalSave {
  source: WorkspaceSelection;
  baseState: PersistedState;
  localState: PersistedState;
}

interface MutableValue<T> {
  current: T;
}

interface UseWorkspaceYDocSubscriptionParams {
  yDoc: Y.Doc | null;
  runInYDoc: ReturnType<typeof useWorkspaceYDocGateway>['runInYDoc'];
  activeSourceRef: MutableValue<WorkspaceSelection>;
  persistedStateRef: MutableValue<PersistedState | null>;
  lastLocalSaveRef: MutableValue<PendingLocalSave | null>;
  getDraftEntries: () => DraftEntry[];
  replaceDrafts: (drafts: DraftEntry[]) => void;
  replaceTrashedDrafts: (drafts: DraftEntry[]) => void;
  replaceSavedTableDrafts: (records: Map<string, SavedTableDraftRecord>) => void;
  cacheDraftRecord: (draftId: string, record: GlobalDraftRecord) => void;
  applyYDocState: (state: PersistedState) => void;
  setPersistedStateIfChanged: (state: PersistedState | null) => void;
  syncActiveSource: (source: WorkspaceSelection) => void;
}

const isSameState = (left: PersistedState, right: PersistedState) =>
  serializePersistedStateForComparison(left) === serializePersistedStateForComparison(right);

export function useWorkspaceYDocSubscription({
  yDoc,
  runInYDoc,
  activeSourceRef,
  persistedStateRef,
  lastLocalSaveRef,
  getDraftEntries,
  replaceDrafts,
  replaceTrashedDrafts,
  replaceSavedTableDrafts,
  cacheDraftRecord,
  applyYDocState,
  setPersistedStateIfChanged,
  syncActiveSource,
}: UseWorkspaceYDocSubscriptionParams) {
  useEffect(() => {
    if (!yDoc) return;

    const refreshFromYDoc = (change?: WorkspaceYDocChange) => {
      let allDrafts = getDraftEntries();
      if (!change || change.collection === 'drafts') {
        allDrafts = listDraftRecordsFromYDoc(yDoc);
        replaceDrafts(allDrafts);
        replaceTrashedDrafts(listTrashedDraftRecordsFromYDoc(yDoc));
      }
      if (!change || change.collection === 'savedDrafts') {
        replaceSavedTableDrafts(listSavedDraftsFromYDoc(yDoc));
      }
      if (change?.origin === WORKSPACE_YDOC_LOCAL_EDIT_ORIGIN) return;

      const source = activeSourceRef.current;
      if (change) {
        const sourceId = source.kind === 'draft' ? source.draftId : source.normalizedName;
        const sourceCollectionChanged =
          source.kind === 'draft'
            ? change.collection === 'drafts'
            : change.collection === 'savedTables' || change.collection === 'savedDrafts';
        if (
          !sourceCollectionChanged ||
          (change.entityIds.size > 0 && !change.entityIds.has(sourceId))
        ) {
          return;
        }
      }

      const reconcileDraftState = (nextState: PersistedState) => {
        const lastLocalSave = lastLocalSaveRef.current;
        if (
          !lastLocalSave ||
          source.kind !== 'draft' ||
          !isSameWorkspaceSource(lastLocalSave.source, source)
        ) {
          return nextState;
        }
        if (isSameState(nextState, lastLocalSave.localState)) {
          lastLocalSaveRef.current = null;
          return nextState;
        }
        const merged = mergeLocalDraftChanges(
          lastLocalSave.baseState,
          lastLocalSave.localState,
          nextState,
        );
        if (isSameState(merged, nextState)) return nextState;

        const existingRecord = getDraftRecordFromYDoc(yDoc, source.draftId);
        const draftRecord: GlobalDraftRecord = {
          createdAt: existingRecord?.createdAt ?? Date.now(),
          updatedAt: Date.now(),
          state: merged,
          folderId: existingRecord?.folderId,
        };
        cacheDraftRecord(source.draftId, draftRecord);
        runInYDoc(() =>
          upsertDraftInYDoc(yDoc, source.draftId, draftRecord, { compactSnapshotBase: true }),
        );
        lastLocalSaveRef.current = {
          source,
          baseState: nextState,
          localState: merged,
        };
        return merged;
      };

      if (source.kind === 'saved_table') {
        const savedDraft = getSavedDraftFromYDoc(yDoc, source.normalizedName);
        const savedTable = getSavedTableFromYDoc(yDoc, source.normalizedName);
        const nextState = savedDraft?.state ?? savedTable?.state ?? null;
        if (nextState) {
          applyYDocState(nextState);
          return;
        }
      } else {
        const nextState = getStateForWorkspaceSource(yDoc, source);
        if (nextState) {
          applyYDocState(reconcileDraftState(nextState));
          return;
        }
      }

      if (!persistedStateRef.current) {
        const initialDraft = pickInitialDraft(allDrafts);
        if (initialDraft) {
          syncActiveSource({ kind: 'draft', draftId: initialDraft.draftId });
          applyYDocState(initialDraft.record.state);
          return;
        }
      }
      if (source.kind === 'draft') setPersistedStateIfChanged(null);
    };

    const unsubscribe = subscribeWorkspaceYDoc(yDoc, refreshFromYDoc, [
      'drafts',
      'savedTables',
      'savedDrafts',
    ]);
    refreshFromYDoc();
    return unsubscribe;
  }, [
    activeSourceRef,
    applyYDocState,
    cacheDraftRecord,
    getDraftEntries,
    lastLocalSaveRef,
    persistedStateRef,
    replaceDrafts,
    replaceTrashedDrafts,
    replaceSavedTableDrafts,
    runInYDoc,
    setPersistedStateIfChanged,
    syncActiveSource,
    yDoc,
  ]);
}
