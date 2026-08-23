import { useState, useEffect, useCallback, useRef } from 'react';
import type { PersistedState } from '@ddlbuilder/shared-types';
import {
  getWorkspaceSnapshotFromYDoc,
  WORKSPACE_YDOC_LOCAL_EDIT_ORIGIN,
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
import { serializePersistedStateForComparison } from '@/utils/persistedStateSignature';
import { useWorkspaceYDocGateway } from '@/hooks/useWorkspaceYDocGateway';
import { useWorkspaceScopeState } from '@/hooks/useWorkspaceScope';
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
import {
  usePersistenceQueue,
  type PersistenceFailure,
} from './workspacePersistence/usePersistenceQueue';
import { useDraftRecords } from './workspacePersistence/useDraftRecords';
import { useSavedTableDraftRecords } from './workspacePersistence/useSavedTableDraftRecords';
import {
  useWorkspaceInitialHydration,
  type ShareLoadStatus,
} from './workspacePersistence/useWorkspaceInitialHydration';
import {
  useWorkspaceYDocSubscription,
  type PendingLocalSave,
} from './workspacePersistence/useWorkspaceYDocSubscription';
import { useWorkspaceSnapshotRefresh } from './workspacePersistence/useWorkspaceSnapshotRefresh';

const isSamePersistedState = (left: PersistedState, right: PersistedState) =>
  serializePersistedStateForComparison(left) === serializePersistedStateForComparison(right);

export interface UsePersistedStateReturn {
  persistedState: PersistedState | null;
  hydrated: boolean;
  saveState: (payload: WorkspaceSavePayload) => void;
  clearState: () => void;
  shareLoadStatus: ShareLoadStatus;
  isShareView: boolean;
  activeSource: WorkspaceSelection;
  draftSummaries: DraftSummary[];
  getDraftState: (draftId: string) => PersistedState | null;
  resolveWorkspaceSnapshot: (
    source: WorkspaceSelection,
  ) => { source: WorkspaceSelection; state: PersistedState } | null;
  setWorkspaceSnapshot: (source: WorkspaceSelection, state: PersistedState) => void;
  selectWorkspaceSnapshot: (source: WorkspaceSelection, state: PersistedState) => void;
  createDraft: (draftId: string, state: PersistedState) => string;
  deleteDraftById: (draftId: string) => void;
  moveDraftToFolder: (draftId: string, folderId?: string) => void;
  getSavedTableDraft: (normalizedName: string) => SavedTableDraftRecord | null;
  removeSavedTableDraft: (normalizedName: string) => void;
  renameSavedTableDraft: (
    fromNormalizedName: string,
    toNormalizedName: string,
    nextTableName: string,
  ) => void;
  trashedDrafts: DraftSummary[];
  restoreDraftById: (draftId: string) => Promise<void>;
  permanentlyDeleteDraftById: (draftId: string) => void;
  persistenceFailure: PersistenceFailure | null;
  retryPersistence: () => void;
}

export function usePersistedState(): UsePersistedStateReturn {
  const pathInfo = useShareRoute();
  const shareId = pathInfo.shareId;
  const shareStorageKey = shareId ? buildShareStorageKey(shareId) : null;
  const [persistedState, setPersistedState] = useState<PersistedState | null>(null);
  const [activeSource, setActiveSource] = useState<WorkspaceSelection>({
    kind: 'draft',
    draftId: DEFAULT_DRAFT_ID,
  });
  const {
    enqueue: enqueuePersistence,
    failure: persistenceFailure,
    retryFailed: retryPersistence,
  } = usePersistenceQueue();

  const activeSourceRef = useRef<WorkspaceSelection>({
    kind: 'draft',
    draftId: DEFAULT_DRAFT_ID,
  });
  const persistedStateRef = useRef<PersistedState | null>(null);
  const lastLocalSaveRef = useRef<PendingLocalSave | null>(null);

  const { scope: currentScope, ready: workspaceScopeReady } = useWorkspaceScopeState();
  // 分享页没有 workspace 上下文，Y.Doc 永远不参与，本地分区即真相源。
  const { workspaceYDoc, yDoc, yDocReady, runInYDoc } = useWorkspaceYDocGateway(currentScope, {
    enabled: !shareId,
    origin: WORKSPACE_YDOC_LOCAL_EDIT_ORIGIN,
  });
  const shouldWaitForYDocHydration = Boolean(
    !shareId &&
    currentScope.kind === 'user' &&
    currentScope.workspaceId &&
    !workspaceYDoc.localSynced,
  );
  const draftRecords = useDraftRecords({
    currentScope,
    disabled: Boolean(shareId),
    persistLocally: !yDocReady,
    enqueuePersistence,
    runInYDoc,
  });
  const savedTableDraftRecords = useSavedTableDraftRecords({
    currentScope,
    disabled: Boolean(shareId),
    persistLocally: !yDocReady,
    enqueuePersistence,
    runInYDoc,
  });
  const {
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
  } = draftRecords;
  const {
    replaceSavedTableDrafts,
    getSavedTableDraft,
    persistSavedTableDraft,
    dropSavedTableDraft,
    removeSavedTableDraft,
    renameSavedTableDraft,
  } = savedTableDraftRecords;

  const syncActiveSource = useCallback((source: WorkspaceSelection) => {
    activeSourceRef.current = source;
    setActiveSource((prev) => (isSameWorkspaceSelection(prev, source) ? prev : source));
  }, []);

  const setPersistedStateIfChanged = useCallback((nextState: PersistedState | null) => {
    setPersistedState((prevState) => {
      if (!prevState || !nextState) {
        return prevState === nextState ? prevState : nextState;
      }
      return isSamePersistedState(prevState, nextState) ? prevState : nextState;
    });
  }, []);

  const applyYDocState = useCallback((nextState: PersistedState) => {
    setPersistedState((previousState) => {
      if (!previousState) return nextState;
      const mergedState: PersistedState = {
        ...nextState,
        sqlFormatMode: previousState.sqlFormatMode,
        addCount: previousState.addCount,
        indexInput: previousState.indexInput,
        currentIndexFields: previousState.currentIndexFields,
        fieldTableViewConfig: previousState.fieldTableViewConfig,
      };
      return isSamePersistedState(previousState, mergedState) ? previousState : mergedState;
    });
  }, []);

  useEffect(() => {
    persistedStateRef.current = persistedState;
  }, [persistedState]);

  const { hydrated, setHydrated, shareLoadStatus } = useWorkspaceInitialHydration({
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
  });

  useWorkspaceSnapshotRefresh({
    disabled: Boolean(shareId || !workspaceScopeReady || yDocReady),
    currentScope,
    replaceDrafts,
    replaceSavedTableDrafts,
    syncActiveSource,
    setPersistedStateIfChanged,
    setHydrated,
  });

  const writeSession = useCallback(
    (source: WorkspaceSelection) => {
      enqueuePersistence('workspace-session', 'save workspace session', () =>
        writeWorkspaceSession(
          { activeSource: toWorkspaceSource(source), updatedAt: Date.now() },
          currentScope,
        ),
      );
    },
    [currentScope, enqueuePersistence],
  );

  const resetToDefaultDraft = useCallback(() => {
    syncActiveSource({ kind: 'draft', draftId: DEFAULT_DRAFT_ID });
    enqueuePersistence('workspace-session', 'clear workspace session', () =>
      clearWorkspaceSession(currentScope),
    );
    setPersistedState(null);
  }, [currentScope, enqueuePersistence, syncActiveSource]);

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
    [saveDraftState, shareId, syncActiveSource, writeSession],
  );

  const selectWorkspaceSnapshot = useCallback(
    (source: WorkspaceSelection, state: PersistedState) => {
      if (shareId) return;

      syncActiveSource(source);
      setPersistedStateIfChanged(state);
      writeSession(source);
    },
    [setPersistedStateIfChanged, shareId, syncActiveSource, writeSession],
  );

  const resolveWorkspaceSnapshot = useCallback(
    (source: WorkspaceSelection) => {
      if (source.kind === 'draft') {
        const state = getDraftState(source.draftId);
        return state ? { source, state } : null;
      }
      return yDoc ? getWorkspaceSnapshotFromYDoc(yDoc, source) : null;
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

      const currentSource = activeSourceRef.current;
      if (!isSameWorkspaceSource(payload.source, currentSource)) {
        return;
      }
      if (persistedStateRef.current) {
        lastLocalSaveRef.current = {
          source: payload.source,
          baseState: persistedStateRef.current,
          localState: payload.state,
        };
      }

      if (payload.source.kind === 'draft') {
        saveDraftState(payload.source.draftId, payload.state);
      } else {
        const { normalizedName, tableName, baseSignature } = payload.source;
        const existingDraft = getSavedTableDraft(normalizedName);
        const isDirty =
          serializePersistedStateForComparison(payload.state) !== payload.source.baseSignature;
        if (!isDirty) {
          if (existingDraft) dropSavedTableDraft(normalizedName);
        } else if (!existingDraft || !isSamePersistedState(existingDraft.state, payload.state)) {
          persistSavedTableDraft(normalizedName, {
            state: payload.state,
            tableName,
            baseSignature,
            updatedAt: Date.now(),
          });
        }
      }

      writeSession(payload.source);
      syncActiveSource(payload.source);
    },
    [
      dropSavedTableDraft,
      getSavedTableDraft,
      hydrated,
      persistSavedTableDraft,
      saveDraftState,
      shareStorageKey,
      syncActiveSource,
      writeSession,
    ],
  );

  const clearState = useCallback(() => {
    if (shareStorageKey) {
      removeStorage(shareStorageKey);
      setPersistedState(null);
      return;
    }

    if (activeSource.kind === 'draft') {
      clearDraft(activeSource.draftId);
    }

    resetToDefaultDraft();
  }, [activeSource, clearDraft, resetToDefaultDraft, shareStorageKey]);

  const deleteDraftById = useCallback(
    (draftId: string) => {
      if (!moveDraftToTrash(draftId)) return;
      if (activeSourceRef.current.kind === 'draft' && activeSourceRef.current.draftId === draftId) {
        resetToDefaultDraft();
      }
    },
    [moveDraftToTrash, resetToDefaultDraft],
  );

  return {
    persistedState,
    hydrated,
    saveState,
    clearState,
    shareLoadStatus,
    isShareView: Boolean(shareId),
    activeSource,
    draftSummaries,
    getDraftState,
    resolveWorkspaceSnapshot,
    setWorkspaceSnapshot,
    selectWorkspaceSnapshot,
    createDraft,
    deleteDraftById,
    moveDraftToFolder,
    getSavedTableDraft,
    removeSavedTableDraft,
    renameSavedTableDraft,
    trashedDrafts,
    restoreDraftById,
    permanentlyDeleteDraftById,
    persistenceFailure,
    retryPersistence,
  };
}
