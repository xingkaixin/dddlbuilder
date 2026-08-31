import { isSameSavedTable, savedTableKey } from '@ddlbuilder/shared-types/workspace';
import { useEffect } from 'react';
import { useTabStore } from '@/stores/tabStore';
import type * as Y from 'yjs';
import {
  withEditorSession,
  type PersistedState,
  type SchemaDocumentState,
} from '@ddlbuilder/shared-types';
import type { SavedTableDraftRecord, WorkspaceSelection } from '@ddlbuilder/shared-types/workspace';
import type { useWorkspaceYDocGateway } from '@/hooks/useWorkspaceYDocGateway';
import {
  getSavedDraftFromYDoc,
  getSavedTableFromYDoc,
  getStateForWorkspaceSource,
  getWorkspaceSnapshotFromYDoc,
  listDraftRecordsFromYDoc,
  listSavedDraftsFromYDoc,
  subscribeWorkspaceYDoc,
  type WorkspaceYDocChange,
  WorkspaceYDocOrigin,
  upsertSavedDraftInYDoc,
} from '@/services/workspaceYDocAdapter';
import { buildSchemaStateSignature } from '@/utils/persistedStateSignature';
import { pickInitialDraft } from './hydration';
import { resolveSavedTableSnapshot } from '@/services/savedTableSnapshot';
import { isSameWorkspaceSource } from './normalize';
import { useEditorStore } from '@/stores';
import { toEditorSessionSnapshot } from '@/stores/editorDocumentCodec';
import { DEFAULT_DRAFT_ID } from '@/utils/workspaceStateDb';

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
  replaceSavedTableDrafts: (records: Map<string, SavedTableDraftRecord>) => void;
  applyYDocState: (state: PersistedState) => void;
  setPersistedStateIfChanged: (state: PersistedState | null) => void;
  syncActiveSource: (source: WorkspaceSelection) => void;
}

const isSameState = (left: PersistedState, right: PersistedState) =>
  buildSchemaStateSignature(left) === buildSchemaStateSignature(right);

export function useWorkspaceYDocSubscription({
  yDoc,
  runInYDoc,
  activeSourceRef,
  persistedStateRef,
  lastLocalSaveRef,
  replaceSavedTableDrafts,
  applyYDocState,
  setPersistedStateIfChanged,
  syncActiveSource,
}: UseWorkspaceYDocSubscriptionParams) {
  useEffect(() => {
    if (!yDoc) return;

    const refreshFromYDoc = (change?: WorkspaceYDocChange) => {
      const applyRemoteState = (state: SchemaDocumentState) =>
        applyYDocState(
          withEditorSession(state, toEditorSessionSnapshot(useEditorStore.getState())),
        );

      if (!change || change.collection === 'savedDrafts' || change.collection === 'savedTables') {
        replaceSavedTableDrafts(listSavedDraftsFromYDoc(yDoc));
      }
      if (change?.origin === WorkspaceYDocOrigin.LocalEdit) return;
      if (change?.collection === 'drafts') {
        const tabs = useTabStore.getState();
        const previousActiveId = tabs.activeTabId;
        for (const tab of tabs.tabs) {
          if (tab.source.kind === 'draft' && !getStateForWorkspaceSource(yDoc, tab.source)) {
            tabs.closeTab(tab.id);
          }
        }
        if (previousActiveId !== useTabStore.getState().activeTabId) {
          const nextTab = tabs.getActiveTab();
          const snapshot =
            nextTab && !nextTab.isLoading
              ? (getWorkspaceSnapshotFromYDoc(
                  yDoc,
                  nextTab.source,
                  toEditorSessionSnapshot(useEditorStore.getState()),
                ) ?? { source: nextTab.source, state: nextTab.stateSnapshot })
              : null;
          if (nextTab && snapshot) {
            tabs.hydrateTab(nextTab.id, snapshot.source, snapshot.state);
            syncActiveSource(snapshot.source);
            applyRemoteState(snapshot.state);
          } else {
            syncActiveSource(nextTab?.source ?? { kind: 'draft', draftId: DEFAULT_DRAFT_ID });
            setPersistedStateIfChanged(null);
          }
          return;
        }
      }
      for (const rename of change?.renamedTables ?? []) {
        useTabStore
          .getState()
          .renameSavedTableTabs(
            { normalizedName: rename.previousName, tableId: rename.tableId },
            rename.normalizedName,
            rename.tableName,
          );
        const active = activeSourceRef.current;
        if (
          active.kind === 'saved_table' &&
          isSameSavedTable(active, { normalizedName: rename.previousName, tableId: rename.tableId })
        ) {
          syncActiveSource({
            ...active,
            normalizedName: rename.normalizedName,
            tableName: rename.tableName,
          });
        }
      }

      const source = activeSourceRef.current;
      if (change) {
        const sourceId = source.kind === 'draft' ? source.draftId : savedTableKey(source);
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

      if (source.kind === 'saved_table') {
        const savedDraft = getSavedDraftFromYDoc(yDoc, source);
        const savedTable = getSavedTableFromYDoc(yDoc, source);
        if (savedTable) {
          const pending = lastLocalSaveRef.current;
          // 远端保存会删除共享草稿节点，但尚未同步的本地输入仍需重新落回草稿。
          const pendingDraft =
            !savedDraft &&
            savedTable.trashedAt == null &&
            pending?.source.kind === 'saved_table' &&
            isSameWorkspaceSource(pending.source, source) &&
            buildSchemaStateSignature(pending.localState) !== source.baseSignature
              ? {
                  state: pending.localState,
                  tableName: source.tableName,
                  baseSignature: pending.source.baseSignature,
                  baseState: pending.baseState,
                  updatedAt: Date.now(),
                }
              : null;
          const snapshot = resolveSavedTableSnapshot(savedTable, savedDraft ?? pendingDraft);
          if (pendingDraft && !isSameState(snapshot.state, savedTable.state)) {
            runInYDoc(() =>
              upsertSavedDraftInYDoc(yDoc, snapshot.source, {
                ...pendingDraft,
                state: snapshot.state,
                baseSignature: snapshot.source.baseSignature,
                baseState: savedTable.state,
              }),
            );
            lastLocalSaveRef.current = {
              source: snapshot.source,
              baseState: savedTable.state,
              localState: snapshot.state,
            };
          }
          syncActiveSource(snapshot.source);
          applyRemoteState(snapshot.state);
          return;
        }
        if (savedDraft) {
          applyRemoteState(savedDraft.state);
          return;
        }
      } else {
        const nextState = getStateForWorkspaceSource(yDoc, source);
        if (nextState) {
          applyRemoteState(nextState);
          return;
        }
      }

      if (!persistedStateRef.current) {
        const initialDraft = pickInitialDraft(listDraftRecordsFromYDoc(yDoc));
        if (initialDraft) {
          syncActiveSource({ kind: 'draft', draftId: initialDraft.draftId });
          applyRemoteState(initialDraft.record.state);
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
    lastLocalSaveRef,
    persistedStateRef,
    replaceSavedTableDrafts,
    runInYDoc,
    setPersistedStateIfChanged,
    syncActiveSource,
    yDoc,
  ]);
}
