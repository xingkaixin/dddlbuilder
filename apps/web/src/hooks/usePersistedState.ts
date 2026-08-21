import { useQuery } from '@tanstack/react-query';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type * as Y from 'yjs';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { useAuthSession } from '@/auth/AuthSessionProvider';
import { useWorkspaceYDoc } from '@/providers/WorkspaceYDocProvider';
import { shareStateOptions } from '@/queries/share';
import { ShareApiError } from '@/services/shareService';
import { WORKSPACE_SNAPSHOT_APPLIED_EVENT } from '@/services/workspaceSyncService';
import {
  deleteDraftFromYDoc,
  deleteSavedDraftFromYDoc,
  getDraftRecordFromYDoc,
  getSavedDraftFromYDoc,
  getSavedTableFromYDoc,
  getStateForWorkspaceSource,
  listDraftRecordsFromYDoc,
  listSavedDraftsFromYDoc,
  subscribeWorkspaceYDoc,
  type WorkspaceYDocChange,
  WORKSPACE_YDOC_LOCAL_EDIT_ORIGIN,
  upsertDraftInYDoc,
  upsertSavedDraftInYDoc,
} from '@/services/workspaceYDocAdapter';
import type {
  DraftSummary,
  SavedTableDraftRecord,
  WorkspaceSavePayload,
  WorkspaceSelection,
  WorkspaceScope,
} from '@ddlbuilder/shared-types/workspace';
import {
  clearWorkspaceSession,
  DEFAULT_DRAFT_ID,
  deleteDraft,
  deleteSavedDraft,
  listSavedDrafts,
  listTrashedDrafts,
  readDraft,
  renameSavedDraftKey,
  upsertSavedDraft,
  writeDraft,
  writeWorkspaceSession,
} from '@/utils/workspaceStateDb';
import { serializePersistedStateForComparison } from '@/utils/persistedStateSignature';
import { getWorkspaceBootstrap } from './workspacePersistence/bootstrap';
import { resetWorkspaceBootstrapCache } from './workspacePersistence/bootstrap';
import { getAnonymousWorkspaceScope } from '@/utils/workspaceScope';
import {
  buildDraftSummary,
  getDraftDisplayName,
  isSameWorkspaceSource,
  isSameWorkspaceSelection,
  normalizePersistedState,
  normalizeWorkspaceSession,
  resolveUniqueDraftName,
  toWorkspaceSource,
  type GlobalDraftRecord,
} from './workspacePersistence/normalize';
import {
  collectBootstrapDrafts,
  pickInitialDraft,
  resolveWorkspaceHydration,
  toDraftSummary,
  toHydrationSavedTable,
  type DraftEntry,
  type WorkspaceHydration,
} from './workspacePersistence/hydration';
import { mergeLocalDraftChanges } from './workspacePersistence/mergeLocalEdits';
import { leaveShareRoute, useShareRoute } from './workspacePersistence/shareRoute';
import {
  buildShareStorageKey,
  fireAndForget,
  readStorageJson,
  removeStorage,
  writeStorageJson,
} from './workspacePersistence/storage';

const sortDraftSummaries = (drafts: DraftSummary[]) =>
  [...drafts].sort((a, b) => b.createdAt - a.createdAt || a.draftId.localeCompare(b.draftId));

const isSamePersistedState = (left: PersistedState, right: PersistedState) =>
  serializePersistedStateForComparison(left) === serializePersistedStateForComparison(right);

type ShareLoadStatus = 'idle' | 'not_found' | 'error';

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
}

export function usePersistedState(): UsePersistedStateReturn {
  const authSession = useAuthSession();
  const workspaceYDoc = useWorkspaceYDoc();
  const pathInfo = useShareRoute();
  const shareId = pathInfo.shareId;
  const shareStorageKey = shareId ? buildShareStorageKey(shareId) : null;
  const shareQuery = useQuery({
    ...shareStateOptions(shareId ?? ''),
    enabled: Boolean(shareId && shareStorageKey && !pathInfo.invalid),
  });
  const [hydrated, setHydrated] = useState(false);
  const [persistedState, setPersistedState] = useState<PersistedState | null>(null);
  const [shareLoadStatus, setShareLoadStatus] = useState<ShareLoadStatus>('idle');
  const [activeSource, setActiveSource] = useState<WorkspaceSelection>({
    kind: 'draft',
    draftId: DEFAULT_DRAFT_ID,
  });
  const [draftSummaries, setDraftSummaries] = useState<DraftSummary[]>([]);
  const [trashedDrafts, setTrashedDrafts] = useState<DraftSummary[]>([]);

  const activeSourceRef = useRef<WorkspaceSelection>({
    kind: 'draft',
    draftId: DEFAULT_DRAFT_ID,
  });
  const persistedStateRef = useRef<PersistedState | null>(null);
  const lastLocalSaveRef = useRef<{
    source: WorkspaceSelection;
    baseState: PersistedState;
    localState: PersistedState;
  } | null>(null);
  const draftsRef = useRef<Map<string, GlobalDraftRecord>>(new Map());
  const savedTableDraftsRef = useRef<Map<string, SavedTableDraftRecord>>(new Map());

  const currentScope = useMemo<WorkspaceScope>(
    () =>
      authSession.status === 'signed_in' && authSession.userId
        ? {
            kind: 'user',
            userId: authSession.userId,
            ...(authSession.workspaceId ? { workspaceId: authSession.workspaceId } : {}),
          }
        : getAnonymousWorkspaceScope(),
    [authSession.status, authSession.userId, authSession.workspaceId],
  );
  const workspaceScopeReady =
    authSession.status !== 'loading' &&
    (authSession.status !== 'signed_in' || Boolean(authSession.workspaceId));
  const yDocReady = Boolean(
    !shareId &&
    workspaceYDoc.doc &&
    workspaceYDoc.localSynced &&
    currentScope.kind === 'user' &&
    currentScope.workspaceId,
  );
  const shouldWaitForYDocHydration = Boolean(
    !shareId &&
    currentScope.kind === 'user' &&
    currentScope.workspaceId &&
    !workspaceYDoc.localSynced,
  );

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

  const applyYDocState = useCallback(
    (nextState: PersistedState) => {
      setPersistedStateIfChanged(nextState);
    },
    [setPersistedStateIfChanged],
  );

  useEffect(() => {
    persistedStateRef.current = persistedState;
  }, [persistedState]);

  const updateDrafts = useCallback((drafts: DraftEntry[]) => {
    draftsRef.current = new Map(drafts.map(({ draftId, record }) => [draftId, record]));
    setDraftSummaries(
      sortDraftSummaries(drafts.map(({ draftId, record }) => toDraftSummary(draftId, record))),
    );
  }, []);

  const getDraftState = useCallback((draftId: string) => {
    return draftsRef.current.get(draftId)?.state ?? null;
  }, []);

  const getSavedTableDraft = useCallback((normalizedName: string) => {
    return savedTableDraftsRef.current.get(normalizedName) ?? null;
  }, []);

  const runInYDoc = useCallback(
    (mutate: (doc: Y.Doc) => void) => {
      if (!yDocReady || !workspaceYDoc.doc) return;
      const doc = workspaceYDoc.doc;
      doc.transact(() => mutate(doc), WORKSPACE_YDOC_LOCAL_EDIT_ORIGIN);
    },
    [workspaceYDoc.doc, yDocReady],
  );

  const upsertDraftSummary = useCallback((draftId: string, record: GlobalDraftRecord) => {
    setDraftSummaries((prev) => {
      const previous = prev.find((draft) => draft.draftId === draftId);
      return sortDraftSummaries([
        ...prev.filter((draft) => draft.draftId !== draftId),
        buildDraftSummary(
          draftId,
          record.state,
          previous?.createdAt ?? record.createdAt ?? record.updatedAt,
          record.updatedAt,
          previous?.folderId ?? record.folderId,
        ),
      ]);
    });
  }, []);

  const persistDraftRecord = useCallback(
    (draftId: string, record: GlobalDraftRecord) => {
      draftsRef.current.set(draftId, record);
      const written = writeDraft(draftId, record, currentScope);
      runInYDoc((doc) => upsertDraftInYDoc(doc, draftId, record, { compactSnapshotBase: true }));
      return written;
    },
    [currentScope, runInYDoc],
  );

  const dropDraftRecord = useCallback(
    (draftId: string) => {
      runInYDoc((doc) => deleteDraftFromYDoc(doc, draftId));
    },
    [runInYDoc],
  );

  const persistSavedDraftRecord = useCallback(
    (normalizedName: string, record: SavedTableDraftRecord) => {
      savedTableDraftsRef.current.set(normalizedName, record);
      fireAndForget(upsertSavedDraft(normalizedName, record, currentScope));
      runInYDoc((doc) =>
        upsertSavedDraftInYDoc(doc, normalizedName, record, { compactSnapshotBase: true }),
      );
    },
    [currentScope, runInYDoc],
  );

  const dropSavedDraftRecord = useCallback(
    (normalizedName: string) => {
      savedTableDraftsRef.current.delete(normalizedName);
      fireAndForget(deleteSavedDraft(normalizedName, currentScope));
      runInYDoc((doc) => deleteSavedDraftFromYDoc(doc, normalizedName));
    },
    [currentScope, runInYDoc],
  );

  const saveDraftState = useCallback(
    (draftId: string, state: PersistedState) => {
      const existingRecord = draftsRef.current.get(draftId);
      if (existingRecord && isSamePersistedState(existingRecord.state, state)) return;
      const record: GlobalDraftRecord = {
        createdAt: existingRecord?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
        state,
        folderId: existingRecord?.folderId,
      };
      upsertDraftSummary(draftId, record);
      fireAndForget(persistDraftRecord(draftId, record));
    },
    [persistDraftRecord, upsertDraftSummary],
  );

  const writeSession = useCallback(
    (source: WorkspaceSelection) => {
      fireAndForget(
        writeWorkspaceSession(
          { activeSource: toWorkspaceSource(source), updatedAt: Date.now() },
          currentScope,
        ),
      );
    },
    [currentScope],
  );

  const resetToDefaultDraft = useCallback(() => {
    syncActiveSource({ kind: 'draft', draftId: DEFAULT_DRAFT_ID });
    fireAndForget(clearWorkspaceSession(currentScope));
    setPersistedState(null);
  }, [currentScope, syncActiveSource]);

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
        const existingDraft = savedTableDraftsRef.current.get(normalizedName);
        const isDirty =
          serializePersistedStateForComparison(payload.state) !== payload.source.baseSignature;
        if (!isDirty) {
          if (existingDraft) dropSavedDraftRecord(normalizedName);
        } else if (!existingDraft || !isSamePersistedState(existingDraft.state, payload.state)) {
          persistSavedDraftRecord(normalizedName, {
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
      dropSavedDraftRecord,
      hydrated,
      persistSavedDraftRecord,
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
      const { draftId } = activeSource;
      draftsRef.current.delete(draftId);
      setDraftSummaries((prev) => prev.filter((d) => d.draftId !== draftId));
      fireAndForget(deleteDraft(draftId, currentScope));
      runInYDoc((doc) => deleteDraftFromYDoc(doc, draftId));
    }

    resetToDefaultDraft();
  }, [activeSource, currentScope, resetToDefaultDraft, runInYDoc, shareStorageKey]);

  const resolveDraftNameConflict = useCallback((state: PersistedState) => {
    const takenNames = new Set(
      Array.from(draftsRef.current.values(), (record) => getDraftDisplayName(record.state)),
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
      if (shareId) return getDraftDisplayName(state);

      const resolved = resolveDraftNameConflict(state);
      const now = Date.now();
      const record: GlobalDraftRecord = {
        createdAt: now,
        updatedAt: now,
        state: resolved.state,
      };
      upsertDraftSummary(draftId, record);
      fireAndForget(persistDraftRecord(draftId, record));
      return resolved.uniqueName;
    },
    [persistDraftRecord, resolveDraftNameConflict, shareId, upsertDraftSummary],
  );

  const deleteDraftById = useCallback(
    (draftId: string) => {
      if (shareId) return;
      const record = draftsRef.current.get(draftId);
      if (!record) return;

      const now = Date.now();
      const trashedRecord: GlobalDraftRecord = { ...record, updatedAt: now, trashedAt: now };
      draftsRef.current.delete(draftId);
      setDraftSummaries((prev) => prev.filter((d) => d.draftId !== draftId));
      setTrashedDrafts((prev) => [toDraftSummary(draftId, trashedRecord), ...prev]);
      fireAndForget(writeDraft(draftId, trashedRecord, currentScope));
      dropDraftRecord(draftId);

      if (activeSourceRef.current.kind === 'draft' && activeSourceRef.current.draftId === draftId) {
        resetToDefaultDraft();
      }
    },
    [currentScope, dropDraftRecord, resetToDefaultDraft, shareId],
  );

  const restoreDraftById = useCallback(
    async (draftId: string) => {
      if (shareId) return;
      const record = await readDraft(draftId, currentScope);
      if (!record) return;

      const restoredRecord: GlobalDraftRecord = {
        ...record,
        state: resolveDraftNameConflict(record.state).state,
        updatedAt: Date.now(),
        trashedAt: undefined,
      };
      setTrashedDrafts((prev) => prev.filter((d) => d.draftId !== draftId));
      upsertDraftSummary(draftId, restoredRecord);
      await persistDraftRecord(draftId, restoredRecord);
    },
    [currentScope, persistDraftRecord, resolveDraftNameConflict, shareId, upsertDraftSummary],
  );

  const permanentlyDeleteDraftById = useCallback(
    (draftId: string) => {
      if (shareId) return;
      setTrashedDrafts((prev) => prev.filter((d) => d.draftId !== draftId));
      fireAndForget(deleteDraft(draftId, currentScope));
      dropDraftRecord(draftId);
    },
    [currentScope, dropDraftRecord, shareId],
  );

  const moveDraftToFolder = useCallback(
    (draftId: string, folderId?: string) => {
      if (shareId) return;
      const record = draftsRef.current.get(draftId);
      if (!record) return;
      // 只改分组不算内容更新，摘要保留原 updatedAt，避免「最近草稿」排序因移动而跳动
      setDraftSummaries((prev) =>
        prev.map((draft) => (draft.draftId === draftId ? { ...draft, folderId } : draft)),
      );
      fireAndForget(persistDraftRecord(draftId, { ...record, folderId, updatedAt: Date.now() }));
    },
    [persistDraftRecord, shareId],
  );

  const removeSavedTableDraft = useCallback(
    (normalizedName: string) => {
      if (shareId) return;
      dropSavedDraftRecord(normalizedName);
    },
    [dropSavedDraftRecord, shareId],
  );

  const renameSavedTableDraft = useCallback(
    (fromNormalizedName: string, toNormalizedName: string, nextTableName: string) => {
      if (shareId) return;
      const record = savedTableDraftsRef.current.get(fromNormalizedName);
      const keyChanged = fromNormalizedName !== toNormalizedName;
      if (record) {
        const nextRecord = { ...record, tableName: nextTableName, updatedAt: Date.now() };
        savedTableDraftsRef.current.set(toNormalizedName, nextRecord);
        if (keyChanged) {
          savedTableDraftsRef.current.delete(fromNormalizedName);
        }
        // 改键与写值必须落在同一个事务里，否则协作端会先看到重复记录
        runInYDoc((doc) => {
          upsertSavedDraftInYDoc(doc, toNormalizedName, nextRecord, { compactSnapshotBase: true });
          if (keyChanged) {
            deleteSavedDraftFromYDoc(doc, fromNormalizedName);
          }
        });
      }
      fireAndForget(
        renameSavedDraftKey(fromNormalizedName, toNormalizedName, nextTableName, currentScope),
      );
    },
    [currentScope, runInYDoc, shareId],
  );

  useEffect(() => {
    let cancelled = false;

    const hydrateWithState = (state: PersistedState | null) => {
      if (cancelled) return;
      setPersistedState(state);
      setHydrated(true);
    };

    const applyHydration = ({ activeSource: source, state }: WorkspaceHydration) => {
      syncActiveSource(source);
      hydrateWithState(state);
    };

    const loadTrashedDrafts = async () => {
      const trashed = await listTrashedDrafts(currentScope);
      if (cancelled) return;
      setTrashedDrafts(trashed.map(({ draftId, record }) => toDraftSummary(draftId, record)));
    };

    const hydrateYDocWorkspace = async () => {
      if (!workspaceYDoc.doc) return false;
      const doc = workspaceYDoc.doc;

      savedTableDraftsRef.current = listSavedDraftsFromYDoc(doc);
      const drafts: DraftEntry[] = listDraftRecordsFromYDoc(doc);
      updateDrafts(drafts);

      await loadTrashedDrafts();
      if (cancelled) return true;

      const { session: sessionRaw } = await getWorkspaceBootstrap(currentScope);
      if (cancelled) return true;
      applyHydration(
        resolveWorkspaceHydration({
          drafts,
          session: normalizeWorkspaceSession(sessionRaw),
          findSavedTable: (normalizedName) => {
            const savedTable = getSavedTableFromYDoc(doc, normalizedName);
            if (!savedTable) return null;
            return {
              normalizedName: savedTable.normalizedName,
              tableName: savedTable.name,
              state: savedTable.state,
              draftState: getSavedDraftFromYDoc(doc, savedTable.normalizedName)?.state ?? null,
            };
          },
        }),
      );
      return true;
    };

    const hydrateMainWorkspace = async () => {
      if (yDocReady && (await hydrateYDocWorkspace())) {
        return;
      }

      const bootstrap = await getWorkspaceBootstrap(currentScope);
      if (cancelled) return;
      const savedDrafts = await listSavedDrafts(currentScope);
      if (cancelled) return;
      savedTableDraftsRef.current = new Map(Object.entries(savedDrafts));

      const drafts = collectBootstrapDrafts(bootstrap);
      updateDrafts(drafts);

      await loadTrashedDrafts();
      if (cancelled) return;

      applyHydration(
        resolveWorkspaceHydration({
          drafts,
          session: normalizeWorkspaceSession(bootstrap.session),
          findSavedTable: () => toHydrationSavedTable(bootstrap.savedTable),
        }),
      );
    };

    // 分享链接失效后不能就地水合主工作区：那会绕过下面的等待条件，在 Y.Doc 还没加载完时
    // 写到错误的分区。离开分享路径会让本 effect 重新走一遍正常分支。
    if (pathInfo.invalid) {
      setShareLoadStatus('error');
      leaveShareRoute();
      return () => {
        cancelled = true;
      };
    }

    if (!shareId || !shareStorageKey) {
      if (!workspaceScopeReady || shouldWaitForYDocHydration) {
        return () => {
          cancelled = true;
        };
      }
      void hydrateMainWorkspace();
      return () => {
        cancelled = true;
      };
    }

    const cachedShareState = normalizePersistedState(readStorageJson<unknown>(shareStorageKey));
    if (cachedShareState) {
      hydrateWithState(cachedShareState);
    }

    if (shareQuery.isSuccess) {
      hydrateWithState(shareQuery.data);
      writeStorageJson(shareStorageKey, shareQuery.data);
    } else if (shareQuery.isError) {
      if (
        shareQuery.error instanceof ShareApiError &&
        shareQuery.error.code === 'SHARE_NOT_FOUND'
      ) {
        setShareLoadStatus('not_found');
      } else {
        setShareLoadStatus('error');
      }
      leaveShareRoute();
    }

    return () => {
      cancelled = true;
    };
  }, [
    pathInfo.invalid,
    shareId,
    shareQuery.data,
    shareQuery.error,
    shareQuery.isError,
    shareQuery.isSuccess,
    shareStorageKey,
    currentScope,
    syncActiveSource,
    updateDrafts,
    shouldWaitForYDocHydration,
    workspaceScopeReady,
    workspaceYDoc.doc,
    yDocReady,
  ]);

  useEffect(() => {
    if (!yDocReady || !workspaceYDoc.doc) {
      return;
    }

    const doc = workspaceYDoc.doc;
    const refreshFromYDoc = (change?: WorkspaceYDocChange) => {
      let allDrafts: DraftEntry[] = Array.from(draftsRef.current, ([draftId, record]) => ({
        draftId,
        record,
      }));
      if (!change || change.collection === 'drafts') {
        allDrafts = listDraftRecordsFromYDoc(doc);
        updateDrafts(allDrafts);
      }
      if (!change || change.collection === 'savedDrafts') {
        savedTableDraftsRef.current = listSavedDraftsFromYDoc(doc);
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
        if (isSamePersistedState(nextState, lastLocalSave.localState)) {
          lastLocalSaveRef.current = null;
          return nextState;
        }
        const merged = mergeLocalDraftChanges(
          lastLocalSave.baseState,
          lastLocalSave.localState,
          nextState,
        );
        if (isSamePersistedState(merged, nextState)) {
          return nextState;
        }
        const existingRecord = getDraftRecordFromYDoc(doc, source.draftId);
        const draftRecord: GlobalDraftRecord = {
          createdAt: existingRecord?.createdAt ?? Date.now(),
          updatedAt: Date.now(),
          state: merged,
          folderId: existingRecord?.folderId,
        };
        draftsRef.current.set(source.draftId, draftRecord);
        runInYDoc(() =>
          upsertDraftInYDoc(doc, source.draftId, draftRecord, { compactSnapshotBase: true }),
        );
        lastLocalSaveRef.current = {
          source,
          baseState: nextState,
          localState: merged,
        };
        return merged;
      };
      if (source.kind === 'saved_table') {
        const savedDraft = getSavedDraftFromYDoc(doc, source.normalizedName);
        const savedTable = getSavedTableFromYDoc(doc, source.normalizedName);
        const nextState = savedDraft?.state ?? savedTable?.state ?? null;
        if (nextState) {
          applyYDocState(nextState);
          return;
        }
      } else {
        const nextState = getStateForWorkspaceSource(doc, source);
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

      if (source.kind === 'draft') {
        setPersistedStateIfChanged(null);
        return;
      }
    };

    const unsubscribe = subscribeWorkspaceYDoc(doc, refreshFromYDoc, [
      'drafts',
      'savedTables',
      'savedDrafts',
    ]);
    refreshFromYDoc();
    return unsubscribe;
  }, [
    applyYDocState,
    runInYDoc,
    setPersistedStateIfChanged,
    syncActiveSource,
    updateDrafts,
    workspaceYDoc.doc,
    yDocReady,
  ]);

  useEffect(() => {
    if (shareId || !workspaceScopeReady || yDocReady) {
      return;
    }

    let cancelled = false;
    const handleSnapshotApplied = () => {
      void (async () => {
        resetWorkspaceBootstrapCache();
        const bootstrap = await getWorkspaceBootstrap(currentScope);
        const savedDrafts = await listSavedDrafts(currentScope);
        if (cancelled) return;
        savedTableDraftsRef.current = new Map(Object.entries(savedDrafts));

        const drafts = collectBootstrapDrafts(bootstrap);
        updateDrafts(drafts);
        const session = normalizeWorkspaceSession(bootstrap.session);
        const savedTable =
          session?.activeSource.kind === 'saved_table'
            ? toHydrationSavedTable(bootstrap.savedTable)
            : null;

        if (savedTable) {
          syncActiveSource({
            kind: 'saved_table',
            normalizedName: savedTable.normalizedName,
            tableName: savedTable.tableName,
            baseSignature: serializePersistedStateForComparison(savedTable.state),
          });
          setPersistedStateIfChanged(session?.activeState ?? savedTable.state);
          setHydrated(true);
          return;
        }

        const sessionDraftId =
          session?.activeSource.kind === 'draft' ? session.activeSource.draftId : DEFAULT_DRAFT_ID;
        const resolvedDraft =
          drafts.find((draft) => draft.draftId === sessionDraftId) ?? pickInitialDraft(drafts);
        syncActiveSource({ kind: 'draft', draftId: resolvedDraft?.draftId ?? sessionDraftId });
        setPersistedStateIfChanged(resolvedDraft?.record.state ?? session?.activeState ?? null);
        setHydrated(true);
      })();
    };

    window.addEventListener(WORKSPACE_SNAPSHOT_APPLIED_EVENT, handleSnapshotApplied);
    return () => {
      cancelled = true;
      window.removeEventListener(WORKSPACE_SNAPSHOT_APPLIED_EVENT, handleSnapshotApplied);
    };
  }, [
    shareId,
    currentScope,
    setPersistedStateIfChanged,
    syncActiveSource,
    updateDrafts,
    workspaceScopeReady,
    yDocReady,
  ]);

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
  };
}
