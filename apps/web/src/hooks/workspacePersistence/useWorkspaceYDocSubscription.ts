import { isSameSavedTable, savedTableKey } from '@ddlbuilder/shared-types/workspace';
import { useEffect, useEffectEvent } from 'react';
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
import { buildSchemaStateSignature, getWorkspaceSavedDraftNode } from '@ddlbuilder/workspace-core';
import { pickInitialDraft } from './hydration';
import { resolveSavedTableSnapshot } from '@/services/savedTableSnapshot';
import { mergeSchemaStates } from '@/services/schemaStateMerge';
import { isSameWorkspaceSource } from './normalize';
import { useEditorStore } from '@/stores/editorStore';
import { toEditorSessionSnapshot } from '@/stores/editorDocumentCodec';
import { DEFAULT_DRAFT_ID } from '@/utils/workspaceStateDb';

export interface PendingLocalSave {
  source: Extract<WorkspaceSelection, { kind: 'saved_table' }>;
  baseState: PersistedState;
  localState: PersistedState;
  /** 记录本次保存时编辑器看到的状态；此后被远端刷新或重新打开替换，下一次输入才相对新状态。 */
  seenState: PersistedState | null;
  draftNode: Y.Map<unknown> | null;
}

interface MutableValue<T> {
  current: T;
}

interface UseWorkspaceYDocSubscriptionParams {
  yDoc: Y.Doc | null;
  runInYDoc: ReturnType<typeof useWorkspaceYDocGateway>['runInYDoc'];
  activeSourceRef: MutableValue<WorkspaceSelection>;
  persistedState: PersistedState | null;
  pendingLocalSavesRef: MutableValue<Map<string, PendingLocalSave>>;
  replaceSavedTableDrafts: (
    records: Map<string, SavedTableDraftRecord>,
    entityIds?: ReadonlySet<string>,
  ) => void;
  applyYDocState: (state: PersistedState) => void;
  setPersistedStateIfChanged: (state: PersistedState | null) => void;
  syncActiveSource: (source: WorkspaceSelection) => void;
}

const isSameState = (left: PersistedState, right: PersistedState) =>
  buildSchemaStateSignature(left) === buildSchemaStateSignature(right);

const affectsSource = (source: WorkspaceSelection, change?: WorkspaceYDocChange) => {
  if (!change) return true;
  const sourceId = source.kind === 'draft' ? source.draftId : savedTableKey(source);

  const matchesCollection =
    source.kind === 'draft'
      ? change.collection === 'drafts'
      : change.collection === 'savedTables' || change.collection === 'savedDrafts';

  return matchesCollection && (change.entityIds.size === 0 || change.entityIds.has(sourceId));
};

export function useWorkspaceYDocSubscription({
  yDoc,
  runInYDoc,
  activeSourceRef,
  persistedState,
  pendingLocalSavesRef,
  replaceSavedTableDrafts,
  applyYDocState,
  setPersistedStateIfChanged,
  syncActiveSource,
}: UseWorkspaceYDocSubscriptionParams) {
  const hasPersistedState = useEffectEvent(() => persistedState !== null);

  useEffect(() => {
    if (!yDoc) return;
    const pendingLocalSaves = pendingLocalSavesRef.current;

    const refreshSavedTableDrafts = (entityIds?: ReadonlySet<string>) =>
      replaceSavedTableDrafts(listSavedDraftsFromYDoc(yDoc, entityIds), entityIds);

    const refreshSavedTable = (
      source: PendingLocalSave['source'],
      change?: WorkspaceYDocChange,
    ) => {
      let savedDraft = getSavedDraftFromYDoc(yDoc, source);
      const savedTable = getSavedTableFromYDoc(yDoc, source);

      if (!savedTable) return savedDraft ? { source, state: savedDraft.state } : null;

      const key = savedTableKey(source);
      const pending = pendingLocalSaves.get(key);
      const tableSignature = buildSchemaStateSignature(savedTable.state);

      // 两端同时新建草稿节点时只保留一个；落选端把本地修改合并进胜出节点。
      if (
        savedDraft &&
        change?.replacedSavedDrafts?.has(key) &&
        pending &&
        savedDraft.baseSignature === source.baseSignature &&
        tableSignature === source.baseSignature
      ) {
        const state = mergeSchemaStates(savedTable.state, savedDraft.state, pending.localState);

        if (!isSameState(state, savedDraft.state)) {
          const mergedDraft = { ...savedDraft, state, updatedAt: Date.now() };
          runInYDoc(() => upsertSavedDraftInYDoc(yDoc, source, mergedDraft));
          refreshSavedTableDrafts(new Set([key]));
          savedDraft = mergedDraft;
        }

        pendingLocalSaves.set(key, {
          source: pending.source,
          baseState: savedTable.state,
          localState: state,
          seenState: null,
          draftNode: getWorkspaceSavedDraftNode(yDoc, source),
        });
      } else if (
        savedDraft &&
        change?.collection === 'savedDrafts' &&
        pending?.draftNode &&
        pending.draftNode === getWorkspaceSavedDraftNode(yDoc, source)
      ) {
        pending.localState = savedDraft.state;
      }

      if (
        !savedDraft &&
        change?.collection === 'savedDrafts' &&
        pending?.source.baseSignature === tableSignature
      ) {
        pendingLocalSaves.delete(key);
      }

      // 远端保存会删除共享草稿节点，但尚未同步的本地输入仍需重新落回草稿。
      const pendingDraft =
        !savedDraft &&
        savedTable.trashedAt == null &&
        pending &&
        tableSignature !== pending.source.baseSignature
          ? {
              state: pending.localState,
              tableName: savedTable.name,
              baseSignature: pending.source.baseSignature,
              baseState: pending.baseState,
              updatedAt: Date.now(),
            }
          : null;
      const snapshot = resolveSavedTableSnapshot(savedTable, savedDraft ?? pendingDraft);

      if (pendingDraft) {
        if (isSameState(snapshot.state, savedTable.state)) {
          pendingLocalSaves.delete(key);
        } else {
          runInYDoc(() =>
            upsertSavedDraftInYDoc(yDoc, snapshot.source, {
              ...pendingDraft,
              state: snapshot.state,
              baseSignature: snapshot.source.baseSignature,
              baseState: savedTable.state,
            }),
          );
          refreshSavedTableDrafts(new Set([savedTableKey(snapshot.source)]));
          pendingLocalSaves.set(key, {
            source: snapshot.source,
            baseState: savedTable.state,
            localState: snapshot.state,
            seenState: null,
            draftNode: getWorkspaceSavedDraftNode(yDoc, snapshot.source),
          });
        }
      }

      return snapshot;
    };

    const refreshFromYDoc = (change?: WorkspaceYDocChange) => {
      const applyRemoteState = (state: SchemaDocumentState) =>
        applyYDocState(
          withEditorSession(state, toEditorSessionSnapshot(useEditorStore.getState())),
        );

      // 本地编辑在写入 Y.Doc 前已同步更新草稿缓存。
      if (change?.origin === WorkspaceYDocOrigin.LocalEdit) return;

      if (!change || change.collection === 'savedDrafts' || change.collection === 'savedTables') {
        refreshSavedTableDrafts(change?.entityIds.size ? change.entityIds : undefined);
      }

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

      for (const pending of pendingLocalSaves.values()) {
        if (!isSameWorkspaceSource(pending.source, source) && affectsSource(pending.source, change))
          refreshSavedTable(pending.source, change);
      }

      if (!affectsSource(source, change)) return;

      if (source.kind === 'saved_table') {
        const snapshot = refreshSavedTable(source, change);

        if (snapshot) {
          syncActiveSource(snapshot.source);
          applyRemoteState(snapshot.state);

          return;
        }
      } else {
        const nextState = getStateForWorkspaceSource(yDoc, source);

        if (nextState) {
          applyRemoteState(nextState);

          return;
        }
      }

      if (!hasPersistedState()) {
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

    return () => {
      pendingLocalSaves.clear();
      unsubscribe();
    };
  }, [
    activeSourceRef,
    applyYDocState,
    pendingLocalSavesRef,
    replaceSavedTableDrafts,
    runInYDoc,
    setPersistedStateIfChanged,
    syncActiveSource,
    yDoc,
  ]);
}
