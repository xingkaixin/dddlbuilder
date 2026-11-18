import { savedTableKey, type SavedTableTarget } from '@ddlbuilder/shared-types/workspace';
import { useCallback, useReducer, useRef } from 'react';
import { withEditorSession, type PersistedState } from '@ddlbuilder/shared-types';
import {
  getSavedTableFromYDoc,
  getWorkspaceSnapshotFromYDoc,
} from '@/services/workspaceYDocAdapter';
import type {
  DraftSummary,
  SavedTableDraftRecord,
  WorkspaceSavePayload,
  WorkspaceSelection,
} from '@ddlbuilder/shared-types/workspace';
import {
  clearWorkspaceSession,
  DEFAULT_DRAFT_ID,
  writeWorkspaceSession,
} from '@/utils/workspaceStateDb';
import {
  buildPersistedStateSignature,
  buildSchemaStateSignature,
  getWorkspaceSavedDraftNode,
} from '@ddlbuilder/workspace-core';
import { useWorkspaceYDocGateway } from '@/hooks/useWorkspaceYDocGateway';
import { useWorkspaceScopeState } from '@/hooks/useWorkspaceScope';
import { getWorkspaceScopeStorageKey } from '@/utils/workspaceScope';
import {
  isSameWorkspaceSource,
  isSameWorkspaceSelection,
  toWorkspaceSource,
} from './workspacePersistence/normalize';
import { useShareRoute } from './workspacePersistence/shareRoute';
import {
  buildShareStorageKey,
  removeStorage,
  writeStorageJson,
} from './workspacePersistence/storage';
import { usePersistenceQueue } from './workspacePersistence/usePersistenceQueue';
import { useDraftRecords } from './workspacePersistence/useDraftRecords';
import { useSavedTableDraftRecords } from './workspacePersistence/useSavedTableDraftRecords';
import { useWorkspaceInitialHydration } from './workspacePersistence/useWorkspaceInitialHydration';
import {
  useWorkspaceYDocSubscription,
  type PendingLocalSave,
} from './workspacePersistence/useWorkspaceYDocSubscription';
import { useWorkspaceSnapshotRefresh } from './workspacePersistence/useWorkspaceSnapshotRefresh';
import { useWorkspaceStorageTarget } from './workspacePersistence/useWorkspaceStorageTarget';
import { useEditorStore } from '@/stores/editorStore';
import { toEditorSessionSnapshot } from '@/stores/editorDocumentCodec';
import { mergeSchemaStates } from '@/services/schemaStateMerge';

const isSamePersistedState = (left: PersistedState, right: PersistedState) =>
  buildPersistedStateSignature(left) === buildPersistedStateSignature(right);

const isSameOptionalPersistedState = (left: PersistedState | null, right: PersistedState | null) =>
  left && right ? isSamePersistedState(left, right) : left === right;

const DEFAULT_SOURCE: WorkspaceSelection = { kind: 'draft', draftId: DEFAULT_DRAFT_ID };

type WorkspaceDocumentState = {
  persistedState: PersistedState | null;
  activeSource: WorkspaceSelection;
};

type WorkspaceDocumentEvent =
  | { type: 'stateLoaded'; state: PersistedState | null }
  | { type: 'stateRefreshed'; state: PersistedState | null }
  | { type: 'sourceSelected'; source: WorkspaceSelection };

const workspaceDocumentReducer = (
  current: WorkspaceDocumentState,
  event: WorkspaceDocumentEvent,
): WorkspaceDocumentState => {
  switch (event.type) {
    case 'stateLoaded':
      return current.persistedState === event.state
        ? current
        : { ...current, persistedState: event.state };
    case 'stateRefreshed':
      return isSameOptionalPersistedState(current.persistedState, event.state)
        ? current
        : { ...current, persistedState: event.state };
    case 'sourceSelected':
      return isSameWorkspaceSelection(current.activeSource, event.source)
        ? current
        : { ...current, activeSource: event.source };
  }
};

export interface WorkspacePersistenceStatus {
  hydrated: boolean;
  hydrationFailed: boolean;
  retryHydration: () => void;
  isShareView: boolean;
}

export interface ActiveWorkspaceDocument {
  persistedState: PersistedState | null;
  saveState: (payload: WorkspaceSavePayload) => void;
  clearState: (state: PersistedState) => void;
  resetWorkspaceSelection: () => void;
  activeSource: WorkspaceSelection;
  resolveWorkspaceSnapshot: (
    source: WorkspaceSelection,
  ) => { source: WorkspaceSelection; state: PersistedState } | null;
  setWorkspaceSnapshot: (source: WorkspaceSelection, state: PersistedState) => void;
  selectWorkspaceSnapshot: (source: WorkspaceSelection, state: PersistedState) => void;
}

export interface WorkspaceDraftCatalog {
  draftSummaries: DraftSummary[];
  trashedDrafts: DraftSummary[];
  refreshDrafts: () => Promise<void>;
  getDraftState: (draftId: string) => PersistedState | null;
  createDraft: (draftId: string, state: PersistedState) => string;
  deleteDraftById: (draftId: string) => void;
  moveDraftToFolder: (draftId: string, folderId?: string) => void;
  restoreDraftById: (draftId: string) => Promise<void>;
  permanentlyDeleteDraftById: (draftId: string) => Promise<void>;
}

export interface SavedTableDraftCatalog {
  getSavedTableDraft: (normalizedName: SavedTableTarget) => SavedTableDraftRecord | null;
  persistSavedTableDraft: (normalizedName: SavedTableTarget, record: SavedTableDraftRecord) => void;
  removeSavedTableDraft: (normalizedName: SavedTableTarget) => void;
  renameSavedTableDraft: (
    fromNormalizedName: SavedTableTarget,
    toNormalizedName: string,
    nextTableName: string,
  ) => void;
}

export interface UsePersistedStateReturn {
  status: WorkspacePersistenceStatus;
  document: ActiveWorkspaceDocument;
  drafts: WorkspaceDraftCatalog;
  savedTableDrafts: SavedTableDraftCatalog;
}

export function usePersistedState(): UsePersistedStateReturn {
  const pathInfo = useShareRoute();
  const shareId = pathInfo.shareId;
  const shareStorageKey = shareId ? buildShareStorageKey(shareId) : null;

  const [{ persistedState, activeSource }, dispatchDocument] = useReducer(
    workspaceDocumentReducer,
    { persistedState: null, activeSource: DEFAULT_SOURCE },
  );
  const { enqueue: enqueuePersistence } = usePersistenceQueue();

  const activeSourceRef = useRef<WorkspaceSelection>(DEFAULT_SOURCE);
  const pendingLocalSavesRef = useRef(new Map<string, PendingLocalSave>());
  const writtenSessionRef = useRef<{ scopeKey: string; source: WorkspaceSelection } | null>(null);

  const { scope: currentScope, ready: workspaceScopeReady } = useWorkspaceScopeState();

  // 分享页没有 workspace 上下文，Y.Doc 永远不参与，本地分区即真相源。
  const { workspaceYDoc, yDoc, yDocReady, runInYDoc } = useWorkspaceYDocGateway(currentScope, {
    enabled: !shareId,
  });
  const shouldWaitForYDocHydration = Boolean(
    !shareId && currentScope.kind === 'user' && !workspaceYDoc.localSynced,
  );
  const storage = useWorkspaceStorageTarget({
    scope: currentScope,
    yDoc,
    runInYDoc,
  });
  const draftRecords = useDraftRecords({
    yDoc,
    disabled: Boolean(shareId),
    enqueuePersistence,
    storage,
  });
  const savedTableDraftRecords = useSavedTableDraftRecords({
    disabled: Boolean(shareId),
    enqueuePersistence,
    storage,
  });
  const {
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
  } = draftRecords;
  const {
    replaceSavedTableDrafts,
    getSavedTableDraft,
    persistSavedTableDraft,
    dropSavedTableDraft,
    removeSavedTableDraft,
    renameSavedTableDraft,
  } = savedTableDraftRecords;

  // useReducer 不会像 useState 那样提前跳过相同状态；引用与 reducer 中的来源等价，
  // 相同时不派发，避免每次自动保存都让宿主组件多渲染一轮。
  const syncActiveSource = useCallback((source: WorkspaceSelection) => {
    const unchanged = isSameWorkspaceSelection(activeSourceRef.current, source);
    activeSourceRef.current = source;

    if (!unchanged) dispatchDocument({ type: 'sourceSelected', source });
  }, []);

  const setPersistedState = useCallback(
    (state: PersistedState | null) => dispatchDocument({ type: 'stateLoaded', state }),
    [],
  );

  const setPersistedStateIfChanged = useCallback(
    (state: PersistedState | null) => dispatchDocument({ type: 'stateRefreshed', state }),
    [],
  );

  const { hydrated, hydrationFailed, retryHydration, failHydration, markHydrated } =
    useWorkspaceInitialHydration({
      pathInvalid: pathInfo.invalid,
      shareId,
      shareStorageKey,
      currentScope,
      workspaceScopeReady,
      shouldWaitForYDocHydration,
      yDoc,
      setPersistedState,
      syncActiveSource,
      replaceDrafts,
      replaceTrashedDrafts,
      replaceSavedTableDrafts,
    });

  useWorkspaceYDocSubscription({
    yDoc,
    runInYDoc,
    activeSourceRef,
    persistedState,
    pendingLocalSavesRef,
    replaceSavedTableDrafts,
    applyYDocState: setPersistedState,
    setPersistedStateIfChanged,
    syncActiveSource,
  });

  useWorkspaceSnapshotRefresh({
    disabled: Boolean(shareId || !workspaceScopeReady || yDocReady),
    currentScope,
    replaceDrafts,
    replaceSavedTableDrafts,
    syncActiveSource,
    setPersistedStateIfChanged,
    markHydrated,
    failHydration,
  });

  const writeSession = useCallback(
    (source: WorkspaceSelection) => {
      const scopeKey = getWorkspaceScopeStorageKey(currentScope);
      const written = writtenSessionRef.current;

      if (written?.scopeKey === scopeKey && isSameWorkspaceSelection(written.source, source))
        return;
      writtenSessionRef.current = { scopeKey, source };
      void enqueuePersistence(
        'workspace-session',
        'save workspace session',
        () =>
          writeWorkspaceSession(
            { activeSource: toWorkspaceSource(source), updatedAt: Date.now() },
            currentScope,
          ),
        { replaceable: true },
      );
    },
    [currentScope, enqueuePersistence],
  );

  const resetToDefaultDraft = useCallback(() => {
    syncActiveSource({ kind: 'draft', draftId: DEFAULT_DRAFT_ID });
    writtenSessionRef.current = null;
    void enqueuePersistence('workspace-session', 'clear workspace session', () =>
      clearWorkspaceSession(currentScope),
    );
    setPersistedState(null);
  }, [currentScope, enqueuePersistence, setPersistedState, syncActiveSource]);

  const setWorkspaceSnapshot = useCallback(
    (source: WorkspaceSelection, state: PersistedState) => {
      if (shareId) return;

      syncActiveSource(source);
      setPersistedState(state);

      if (source.kind === 'draft') {
        saveDraftState(source.draftId, state);
      }

      writeSession(source);
    },
    [saveDraftState, setPersistedState, shareId, syncActiveSource, writeSession],
  );

  const selectWorkspaceSnapshot = useCallback(
    (source: WorkspaceSelection, state: PersistedState) => {
      if (shareId) return;

      if (source.kind === 'saved_table') {
        const key = savedTableKey(source);
        const pending = pendingLocalSavesRef.current.get(key);

        if (
          pending?.source.baseSignature === source.baseSignature &&
          buildSchemaStateSignature(state) === source.baseSignature
        )
          pendingLocalSavesRef.current.delete(key);
      }

      syncActiveSource(source);
      setPersistedStateIfChanged(state);
      writeSession(source);
    },
    [setPersistedStateIfChanged, shareId, syncActiveSource, writeSession],
  );

  const resolveWorkspaceSnapshot = useCallback(
    (source: WorkspaceSelection) => {
      const editorSession = toEditorSessionSnapshot(useEditorStore.getState());

      if (source.kind === 'draft') {
        const state = getDraftState(source.draftId);

        return state ? { source, state: withEditorSession(state, editorSession) } : null;
      }

      return yDoc ? getWorkspaceSnapshotFromYDoc(yDoc, source, editorSession) : null;
    },
    [getDraftState, yDoc],
  );

  const saveState = useCallback(
    (payload: WorkspaceSavePayload) => {
      if (!hydrated) return;

      if (shareStorageKey) {
        writeStorageJson(shareStorageKey, payload.state);
        setPersistedState(payload.state);

        return;
      }

      // 远端刷新后的表名和基线由工作区选择持有，标签来源用于确认保存目标。
      const source = activeSourceRef.current;

      if (!isSameWorkspaceSource(payload.source, source)) {
        return;
      }

      if (source.kind === 'draft') {
        if (!saveDraftState(source.draftId, payload.state, { activeOnly: true })) return;
      } else {
        const { tableName, baseSignature } = source;
        const key = savedTableKey(source);
        const existingDraft = getSavedTableDraft(source);
        const pending = pendingLocalSavesRef.current.get(key);
        let state = payload.state;
        let seenState = persistedState;
        let savedTableState: PersistedState | undefined;

        // 即使已保存表未变，重新打开也可能换掉编辑器里正在编辑的草稿。
        if (yDoc && pending && persistedState && pending.seenState !== persistedState) {
          const rebased = mergeSchemaStates(pending.baseState, persistedState, pending.localState);
          state = mergeSchemaStates(persistedState, rebased, payload.state);
          savedTableState = getSavedTableFromYDoc(yDoc, source)?.state;

          if (!isSamePersistedState(state, payload.state)) {
            setPersistedStateIfChanged(state);
            seenState = state;
          }
        }

        if (buildSchemaStateSignature(state) === baseSignature) {
          pendingLocalSavesRef.current.delete(key);

          if (existingDraft) dropSavedTableDraft(source);
        } else {
          if (
            !existingDraft ||
            existingDraft.baseSignature !== baseSignature ||
            !isSamePersistedState(existingDraft.state, state)
          ) {
            persistSavedTableDraft(source, {
              state,
              tableName,
              baseSignature,
              updatedAt: Date.now(),
            });
          }

          if (yDoc && persistedState) {
            // 删除帧可能仍针对写入前的草稿，所以保留该草稿的基线签名。
            pendingLocalSavesRef.current.set(key, {
              source: pending?.source ?? {
                ...source,
                baseSignature: existingDraft?.baseSignature || baseSignature,
              },
              baseState: savedTableState ?? pending?.baseState ?? persistedState,
              localState: state,
              seenState,
              draftNode: getWorkspaceSavedDraftNode(yDoc, source),
            });
          }
        }
      }

      writeSession(source);
    },
    [
      dropSavedTableDraft,
      getSavedTableDraft,
      hydrated,
      persistSavedTableDraft,
      persistedState,
      saveDraftState,
      setPersistedState,
      setPersistedStateIfChanged,
      shareStorageKey,
      writeSession,
      yDoc,
    ],
  );

  const clearState = useCallback(
    (state: PersistedState) => {
      if (shareStorageKey) {
        removeStorage(shareStorageKey);
        setPersistedState(null);

        return;
      }

      saveState({ source: activeSourceRef.current, state });
    },
    [saveState, setPersistedState, shareStorageKey],
  );

  const deleteDraftById = useCallback(
    (draftId: string) => {
      if (!moveDraftToTrash(draftId)) return;

      if (activeSourceRef.current.kind === 'draft' && activeSourceRef.current.draftId === draftId) {
        resetToDefaultDraft();
      }
    },
    [moveDraftToTrash, resetToDefaultDraft],
  );

  const clearSavedTableDraft = useCallback(
    (target: SavedTableTarget) => {
      pendingLocalSavesRef.current.delete(savedTableKey(target));
      removeSavedTableDraft(target);
    },
    [removeSavedTableDraft],
  );

  return {
    status: {
      hydrationFailed,
      retryHydration,
      hydrated,
      isShareView: Boolean(shareId),
    },
    document: {
      persistedState,
      saveState,
      clearState,
      resetWorkspaceSelection: resetToDefaultDraft,
      activeSource,
      resolveWorkspaceSnapshot,
      setWorkspaceSnapshot,
      selectWorkspaceSnapshot,
    },
    drafts: {
      draftSummaries,
      refreshDrafts,
      getDraftState,
      createDraft,
      deleteDraftById,
      moveDraftToFolder,
      trashedDrafts,
      restoreDraftById,
      permanentlyDeleteDraftById,
    },
    savedTableDrafts: {
      getSavedTableDraft,
      removeSavedTableDraft: clearSavedTableDraft,
      renameSavedTableDraft,
      persistSavedTableDraft,
    },
  };
}
