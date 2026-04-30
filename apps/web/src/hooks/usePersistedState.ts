import { useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { useAuthSession } from '@/auth/AuthSessionProvider';
import { buildShareStateQueryKey } from '@/queryKeys/share';
import { ShareApiError, getShareState } from '@/services/shareService';
import { WORKSPACE_SNAPSHOT_APPLIED_EVENT } from '@/services/workspaceSyncService';
import type {
  DraftSummary,
  SavedTableDraftRecord,
  WorkspaceSavePayload,
  WorkspaceScope,
  WorkspaceSource,
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
  restoreDraft,
  upsertSavedDraft,
  writeDraft,
  writeWorkspaceSession,
} from '@/utils/workspaceStateDb';
import type { SavedTableRecord } from '@/utils/savedTablesDb';
import { getWorkspaceBootstrap } from './workspacePersistence/bootstrap';
import { resetWorkspaceBootstrapCache } from './workspacePersistence/bootstrap';
import { getAnonymousWorkspaceScope, setCurrentWorkspaceScope } from '@/utils/workspaceScope';
import {
  buildDraftSummary,
  isSameWorkspaceSource,
  normalizeGlobalDraftRecord,
  normalizePersistedState,
  normalizeWorkspaceSession,
  type GlobalDraftRecord,
} from './workspacePersistence/normalize';
import {
  buildShareStorageKey,
  fireAndForget,
  parseSharePath,
  readStorageJson,
  removeStorage,
  writeStorageJson,
} from './workspacePersistence/storage';

const SHARE_CACHE_GC_TIME_MS = 15 * 60 * 1000;

const sortDraftSummaries = (drafts: DraftSummary[]) =>
  [...drafts].sort((a, b) => b.createdAt - a.createdAt || a.draftId.localeCompare(b.draftId));

type ShareLoadStatus = 'idle' | 'not_found' | 'error';

export interface UsePersistedStateReturn {
  persistedState: PersistedState | null;
  hydrated: boolean;
  saveState: (payload: WorkspaceSavePayload) => void;
  clearState: () => void;
  shareLoadStatus: ShareLoadStatus;
  isShareView: boolean;
  activeSource: WorkspaceSource;
  draftSummaries: DraftSummary[];
  /** @deprecated 使用 getDraftState */
  getGlobalDraftState: () => PersistedState | null;
  getDraftState: (draftId: string) => PersistedState | null;
  setWorkspaceSnapshot: (source: WorkspaceSource, state: PersistedState) => void;
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
  const queryClient = useQueryClient();
  const pathInfo = parseSharePath(window.location.pathname);
  const shareId = pathInfo.shareId;
  const shareStorageKey = shareId ? buildShareStorageKey(shareId) : null;
  const [hydrated, setHydrated] = useState(false);
  const [persistedState, setPersistedState] = useState<PersistedState | null>(null);
  const [shareLoadStatus, setShareLoadStatus] = useState<ShareLoadStatus>('idle');
  const [activeSource, setActiveSource] = useState<WorkspaceSource>({
    kind: 'draft',
    draftId: DEFAULT_DRAFT_ID,
  });
  const [draftSummaries, setDraftSummaries] = useState<DraftSummary[]>([]);
  const [trashedDrafts, setTrashedDrafts] = useState<DraftSummary[]>([]);

  const activeSourceRef = useRef<WorkspaceSource>({
    kind: 'draft',
    draftId: DEFAULT_DRAFT_ID,
  });
  const draftsRef = useRef<Map<string, GlobalDraftRecord>>(new Map());
  const savedTableDraftsRef = useRef<Map<string, SavedTableDraftRecord>>(new Map());

  const currentScope = useMemo<WorkspaceScope>(
    () =>
      authSession.status === 'signed_in' && authSession.userId
        ? { kind: 'user', userId: authSession.userId }
        : getAnonymousWorkspaceScope(),
    [authSession.status, authSession.userId],
  );

  const syncActiveSource = useCallback((source: WorkspaceSource) => {
    activeSourceRef.current = source;
    setActiveSource((prev) => (isSameWorkspaceSource(prev, source) ? prev : source));
  }, []);

  const updateDrafts = useCallback(
    (drafts: Array<{ draftId: string; record: GlobalDraftRecord }>) => {
      const map = new Map<string, GlobalDraftRecord>();
      const summaries: DraftSummary[] = [];
      for (const { draftId, record } of drafts) {
        map.set(draftId, record);
        summaries.push(
          buildDraftSummary(
            draftId,
            record.state,
            record.createdAt ?? record.updatedAt,
            record.updatedAt,
            record.folderId,
          ),
        );
      }
      draftsRef.current = map;
      setDraftSummaries(sortDraftSummaries(summaries));
    },
    [],
  );

  const getDraftState = useCallback((draftId: string) => {
    return draftsRef.current.get(draftId)?.state ?? null;
  }, []);

  const getSavedTableDraft = useCallback((normalizedName: string) => {
    return savedTableDraftsRef.current.get(normalizedName) ?? null;
  }, []);

  /** @deprecated 使用 getDraftState */
  const getGlobalDraftState = useCallback(() => {
    return getDraftState(DEFAULT_DRAFT_ID);
  }, [getDraftState]);

  const setWorkspaceSnapshot = useCallback(
    (source: WorkspaceSource, state: PersistedState) => {
      if (shareId) return;

      syncActiveSource(source);
      setPersistedState(state);

      if (source.kind === 'draft') {
        const existingRecord = draftsRef.current.get(source.draftId);
        const draftRecord: GlobalDraftRecord = {
          createdAt: existingRecord?.createdAt ?? Date.now(),
          updatedAt: Date.now(),
          state,
        };
        draftsRef.current.set(source.draftId, draftRecord);
        setDraftSummaries((prev) => {
          const next = prev.filter((d) => d.draftId !== source.draftId);
          const previousSummary = prev.find((d) => d.draftId === source.draftId);
          next.push(
            buildDraftSummary(
              source.draftId,
              state,
              previousSummary?.createdAt ?? draftRecord.createdAt ?? draftRecord.updatedAt,
              draftRecord.updatedAt,
              previousSummary?.folderId,
            ),
          );
          return sortDraftSummaries(next);
        });
        fireAndForget(writeDraft(source.draftId, draftRecord, currentScope));
      }

      fireAndForget(
        writeWorkspaceSession(
          {
            activeSource: source,
            activeState: state,
            updatedAt: Date.now(),
          },
          currentScope,
        ),
      );
    },
    [currentScope, shareId, syncActiveSource],
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
        console.log('[DEBUG] saveState - 源不匹配，跳过保存');
        return;
      }

      if (payload.source.kind === 'draft') {
        const { draftId } = payload.source;
        const existingRecord = draftsRef.current.get(draftId);
        const draftRecord: GlobalDraftRecord = {
          createdAt: existingRecord?.createdAt ?? Date.now(),
          updatedAt: Date.now(),
          state: payload.state,
        };
        draftsRef.current.set(draftId, draftRecord);
        setDraftSummaries((prev) => {
          const next = prev.filter((d) => d.draftId !== draftId);
          const previousSummary = prev.find((d) => d.draftId === draftId);
          next.push(
            buildDraftSummary(
              draftId,
              payload.state,
              previousSummary?.createdAt ?? draftRecord.createdAt ?? draftRecord.updatedAt,
              draftRecord.updatedAt,
              previousSummary?.folderId,
            ),
          );
          return sortDraftSummaries(next);
        });
        fireAndForget(writeDraft(draftId, draftRecord, currentScope));
      }

      if (payload.source.kind === 'saved_table') {
        const { normalizedName, tableName, baseSignature } = payload.source;
        if (payload.isDirty) {
          const record: SavedTableDraftRecord = {
            state: payload.state,
            tableName,
            baseSignature,
            updatedAt: Date.now(),
          };
          savedTableDraftsRef.current.set(normalizedName, record);
          fireAndForget(upsertSavedDraft(normalizedName, record, currentScope));
        } else {
          savedTableDraftsRef.current.delete(normalizedName);
          fireAndForget(deleteSavedDraft(normalizedName, currentScope));
        }
      }

      const activeStateToPersist = payload.state;

      fireAndForget(
        writeWorkspaceSession(
          {
            activeSource: payload.source,
            activeState: activeStateToPersist,
            updatedAt: Date.now(),
          },
          currentScope,
        ),
      );
      syncActiveSource(payload.source);
    },
    [currentScope, hydrated, shareStorageKey, syncActiveSource],
  );

  const clearState = useCallback(() => {
    if (shareStorageKey) {
      removeStorage(shareStorageKey);
      setPersistedState(null);
      return;
    }

    if (activeSource.kind === 'draft') {
      draftsRef.current.delete(activeSource.draftId);
      setDraftSummaries((prev) => prev.filter((d) => d.draftId !== activeSource.draftId));
      fireAndForget(deleteDraft(activeSource.draftId, currentScope));
    }

    syncActiveSource({ kind: 'draft', draftId: DEFAULT_DRAFT_ID });
    fireAndForget(clearWorkspaceSession(currentScope));
    setPersistedState(null);
  }, [activeSource, currentScope, shareStorageKey, syncActiveSource]);

  const createDraft = useCallback(
    (draftId: string, state: PersistedState): string => {
      if (shareId) return state.tableName.trim() || '未命名草稿';

      const existingNames = new Set(
        Array.from(draftsRef.current.values()).map((r) => r.state.tableName.trim() || '未命名草稿'),
      );
      const baseName = state.tableName.trim() || '未命名草稿';
      let uniqueName = baseName;
      if (existingNames.has(uniqueName)) {
        let counter = 1;
        while (existingNames.has(`${uniqueName}_${counter}`)) {
          counter++;
        }
        uniqueName = `${uniqueName}_${counter}`;
      }

      const finalState = uniqueName !== baseName ? { ...state, tableName: uniqueName } : state;
      const now = Date.now();
      const draftRecord: GlobalDraftRecord = {
        createdAt: now,
        updatedAt: now,
        state: finalState,
      };
      draftsRef.current.set(draftId, draftRecord);
      setDraftSummaries((prev) => {
        const next = prev.filter((d) => d.draftId !== draftId);
        next.push(buildDraftSummary(draftId, finalState, now, now));
        return sortDraftSummaries(next);
      });
      fireAndForget(writeDraft(draftId, draftRecord, currentScope));
      return uniqueName;
    },
    [currentScope, shareId],
  );

  const deleteDraftById = useCallback(
    (draftId: string) => {
      if (shareId) return;
      const record = draftsRef.current.get(draftId);
      if (!record) return;

      const trashedRecord: GlobalDraftRecord = {
        ...record,
        updatedAt: Date.now(),
        trashedAt: Date.now(),
      };
      draftsRef.current.delete(draftId);
      setDraftSummaries((prev) => prev.filter((d) => d.draftId !== draftId));
      setTrashedDrafts((prev) => [
        buildDraftSummary(
          draftId,
          trashedRecord.state,
          trashedRecord.createdAt ?? trashedRecord.updatedAt,
          trashedRecord.updatedAt,
          trashedRecord.folderId,
          trashedRecord.trashedAt,
        ),
        ...prev,
      ]);
      fireAndForget(writeDraft(draftId, trashedRecord, currentScope));

      if (activeSourceRef.current.kind === 'draft' && activeSourceRef.current.draftId === draftId) {
        syncActiveSource({ kind: 'draft', draftId: DEFAULT_DRAFT_ID });
        fireAndForget(clearWorkspaceSession(currentScope));
        setPersistedState(null);
      }
    },
    [currentScope, shareId, syncActiveSource],
  );

  const restoreDraftById = useCallback(
    async (draftId: string) => {
      if (shareId) return;
      const record = await readDraft(draftId, currentScope);
      if (!record) return;

      // 命名冲突解决
      const existingNames = new Set(
        Array.from(draftsRef.current.values()).map((r) => r.state.tableName.trim() || '未命名草稿'),
      );
      const baseName = record.state.tableName.trim() || '未命名草稿';
      let uniqueName = baseName;
      if (existingNames.has(uniqueName)) {
        let counter = 1;
        while (existingNames.has(`${uniqueName}_${counter}`)) {
          counter++;
        }
        uniqueName = `${uniqueName}_${counter}`;
      }

      const restoredRecord: GlobalDraftRecord = {
        ...record,
        updatedAt: Date.now(),
        trashedAt: undefined,
      };
      if (uniqueName !== baseName) {
        restoredRecord.state = { ...restoredRecord.state, tableName: uniqueName };
      }

      setTrashedDrafts((prev) => prev.filter((d) => d.draftId !== draftId));
      setDraftSummaries((prev) =>
        sortDraftSummaries([
          ...prev,
          buildDraftSummary(
            draftId,
            restoredRecord.state,
            restoredRecord.createdAt ?? restoredRecord.updatedAt,
            restoredRecord.updatedAt,
            restoredRecord.folderId,
          ),
        ]),
      );
      draftsRef.current.set(draftId, restoredRecord);
      await restoreDraft(draftId, restoredRecord, currentScope);
    },
    [currentScope, shareId],
  );

  const permanentlyDeleteDraftById = useCallback(
    (draftId: string) => {
      if (shareId) return;
      setTrashedDrafts((prev) => prev.filter((d) => d.draftId !== draftId));
      fireAndForget(deleteDraft(draftId, currentScope));
    },
    [currentScope, shareId],
  );

  const moveDraftToFolder = useCallback(
    (draftId: string, folderId?: string) => {
      if (shareId) return;
      const record = draftsRef.current.get(draftId);
      if (!record) return;
      const nextRecord: GlobalDraftRecord = {
        ...record,
        folderId,
        updatedAt: Date.now(),
      };
      draftsRef.current.set(draftId, nextRecord);
      setDraftSummaries((prev) =>
        prev.map((draft) => (draft.draftId === draftId ? { ...draft, folderId } : draft)),
      );
      fireAndForget(writeDraft(draftId, nextRecord, currentScope));
    },
    [currentScope, shareId],
  );

  const removeSavedTableDraft = useCallback(
    (normalizedName: string) => {
      if (shareId) return;
      savedTableDraftsRef.current.delete(normalizedName);
      fireAndForget(deleteSavedDraft(normalizedName, currentScope));
    },
    [currentScope, shareId],
  );

  const renameSavedTableDraft = useCallback(
    (fromNormalizedName: string, toNormalizedName: string, nextTableName: string) => {
      if (shareId) return;
      const record = savedTableDraftsRef.current.get(fromNormalizedName);
      if (record) {
        const nextRecord = {
          ...record,
          tableName: nextTableName,
          updatedAt: Date.now(),
        };
        savedTableDraftsRef.current.set(toNormalizedName, nextRecord);
        if (fromNormalizedName !== toNormalizedName) {
          savedTableDraftsRef.current.delete(fromNormalizedName);
        }
      }
      fireAndForget(
        renameSavedDraftKey(fromNormalizedName, toNormalizedName, nextTableName, currentScope),
      );
    },
    [currentScope, shareId],
  );

  useEffect(() => {
    let cancelled = false;

    const hydrateWithState = (state: PersistedState | null) => {
      if (cancelled) return;
      setPersistedState(state);
      setHydrated(true);
    };

    const hydrateMainWorkspace = async () => {
      setCurrentWorkspaceScope(currentScope);

      const {
        globalDraft: globalDraftRaw,
        drafts: draftsRaw,
        session: sessionRaw,
        savedTable,
      } = await getWorkspaceBootstrap(currentScope);
      const savedDrafts = await listSavedDrafts(currentScope);
      savedTableDraftsRef.current = new Map(Object.entries(savedDrafts));

      const defaultDraftRecord = normalizeGlobalDraftRecord(globalDraftRaw);
      const allDrafts: Array<{ draftId: string; record: GlobalDraftRecord }> = [];
      if (defaultDraftRecord) {
        allDrafts.push({
          draftId: DEFAULT_DRAFT_ID,
          record: defaultDraftRecord,
        });
      }
      // 收集其他草稿（未来多草稿阶段使用）
      if (Array.isArray(draftsRaw)) {
        for (const item of draftsRaw) {
          if (
            item &&
            typeof item.draftId === 'string' &&
            item.draftId !== DEFAULT_DRAFT_ID &&
            item.record &&
            typeof item.record === 'object'
          ) {
            const record = normalizeGlobalDraftRecord(item.record);
            if (record) {
              allDrafts.push({ draftId: item.draftId, record });
            }
          }
        }
      }
      updateDrafts(allDrafts);

      const trashed = await listTrashedDrafts(currentScope);
      setTrashedDrafts(
        trashed.map(({ draftId, record }) =>
          buildDraftSummary(
            draftId,
            record.state,
            record.createdAt ?? record.updatedAt,
            record.updatedAt,
            record.folderId,
            record.trashedAt,
          ),
        ),
      );

      const session = normalizeWorkspaceSession(sessionRaw);

      if (!session) {
        syncActiveSource({ kind: 'draft', draftId: DEFAULT_DRAFT_ID });
        hydrateWithState(defaultDraftRecord?.state ?? null);
        return;
      }

      if (session.activeSource.kind === 'saved_table') {
        if (savedTable) {
          const st = savedTable as SavedTableRecord;
          const baseSignature =
            session.activeSource.baseSignature ||
            (typeof (st as { stateSignature?: unknown }).stateSignature === 'string'
              ? (st as { stateSignature?: string }).stateSignature
              : JSON.stringify(st.state)) ||
            '';
          syncActiveSource({
            kind: 'saved_table',
            normalizedName: st.normalizedName,
            tableName: st.name ?? '',
            baseSignature,
          });
          hydrateWithState(session.activeState ?? st.state);
          return;
        }

        syncActiveSource({ kind: 'draft', draftId: DEFAULT_DRAFT_ID });
        hydrateWithState(defaultDraftRecord?.state ?? null);
        return;
      }

      // 兼容旧 global_draft session，迁移为 draft
      const draftId =
        session.activeSource.kind === 'draft' ? session.activeSource.draftId : DEFAULT_DRAFT_ID;
      syncActiveSource({ kind: 'draft', draftId });
      if (session.activeState) {
        hydrateWithState(session.activeState);
      } else {
        hydrateWithState(defaultDraftRecord?.state ?? null);
      }
    };

    const redirectHome = () => {
      window.history.replaceState({}, '', '/');
    };

    if (pathInfo.invalid) {
      setShareLoadStatus('error');
      redirectHome();
      void hydrateMainWorkspace();
      return () => {
        cancelled = true;
      };
    }

    if (!shareId || !shareStorageKey) {
      if (authSession.status === 'loading') {
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

    queryClient
      .fetchQuery({
        queryKey: buildShareStateQueryKey(shareId),
        staleTime: Number.POSITIVE_INFINITY,
        gcTime: SHARE_CACHE_GC_TIME_MS,
        queryFn: () => getShareState(shareId),
      })
      .then((state) => {
        hydrateWithState(state);
        writeStorageJson(shareStorageKey, state);
      })
      .catch((error) => {
        if (error instanceof ShareApiError && error.code === 'SHARE_NOT_FOUND') {
          setShareLoadStatus('not_found');
        } else {
          setShareLoadStatus('error');
        }
        redirectHome();
        void hydrateMainWorkspace();
      });

    return () => {
      cancelled = true;
    };
  }, [
    pathInfo.invalid,
    queryClient,
    shareId,
    shareStorageKey,
    authSession.status,
    authSession.userId,
    currentScope,
    syncActiveSource,
    updateDrafts,
  ]);

  useEffect(() => {
    if (shareId || authSession.status === 'loading') {
      return;
    }

    let cancelled = false;
    const handleSnapshotApplied = () => {
      void (async () => {
        setCurrentWorkspaceScope(currentScope);
        resetWorkspaceBootstrapCache();
        const {
          globalDraft: globalDraftRaw,
          drafts: draftsRaw,
          session: sessionRaw,
          savedTable,
        } = await getWorkspaceBootstrap(currentScope);
        const savedDrafts = await listSavedDrafts(currentScope);
        if (cancelled) return;
        savedTableDraftsRef.current = new Map(Object.entries(savedDrafts));

        const defaultDraftRecord = normalizeGlobalDraftRecord(globalDraftRaw);
        const allDrafts: Array<{ draftId: string; record: GlobalDraftRecord }> = [];
        if (defaultDraftRecord) {
          allDrafts.push({
            draftId: DEFAULT_DRAFT_ID,
            record: defaultDraftRecord,
          });
        }
        if (Array.isArray(draftsRaw)) {
          for (const item of draftsRaw) {
            if (
              item &&
              typeof item.draftId === 'string' &&
              item.draftId !== DEFAULT_DRAFT_ID &&
              item.record &&
              typeof item.record === 'object'
            ) {
              const record = normalizeGlobalDraftRecord(item.record);
              if (record) {
                allDrafts.push({ draftId: item.draftId, record });
              }
            }
          }
        }
        updateDrafts(allDrafts);
        const session = normalizeWorkspaceSession(sessionRaw);

        if (!session) {
          syncActiveSource({ kind: 'draft', draftId: DEFAULT_DRAFT_ID });
          setPersistedState(defaultDraftRecord?.state ?? null);
          setHydrated(true);
          return;
        }

        if (session.activeSource.kind === 'saved_table' && savedTable) {
          const st = savedTable as SavedTableRecord;
          syncActiveSource({
            kind: 'saved_table',
            normalizedName: st.normalizedName,
            tableName: st.name ?? '',
            baseSignature:
              session.activeSource.baseSignature ||
              (typeof (st as { stateSignature?: unknown }).stateSignature === 'string'
                ? (st as { stateSignature?: string }).stateSignature
                : JSON.stringify(st.state)) ||
              '',
          });
          setPersistedState(session.activeState ?? st.state);
          setHydrated(true);
          return;
        }

        const draftId =
          session.activeSource.kind === 'draft' ? session.activeSource.draftId : DEFAULT_DRAFT_ID;
        syncActiveSource({ kind: 'draft', draftId });
        setPersistedState(session.activeState ?? defaultDraftRecord?.state ?? null);
        setHydrated(true);
      })();
    };

    window.addEventListener(WORKSPACE_SNAPSHOT_APPLIED_EVENT, handleSnapshotApplied);
    return () => {
      cancelled = true;
      window.removeEventListener(WORKSPACE_SNAPSHOT_APPLIED_EVENT, handleSnapshotApplied);
    };
  }, [shareId, authSession.status, currentScope, syncActiveSource, updateDrafts]);

  return {
    persistedState,
    hydrated,
    saveState,
    clearState,
    shareLoadStatus,
    isShareView: Boolean(shareId),
    activeSource,
    draftSummaries,
    getGlobalDraftState,
    getDraftState,
    setWorkspaceSnapshot,
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
