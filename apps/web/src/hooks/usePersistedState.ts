import { useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { useAuthSession } from '@/auth/AuthSessionProvider';
import { buildShareStateQueryKey } from '@/queryKeys/share';
import { ShareApiError, getShareState } from '@/services/shareService';
import { WORKSPACE_SNAPSHOT_APPLIED_EVENT } from '@/services/workspaceSyncService';
import type {
  DraftSummary,
  WorkspaceSavePayload,
  WorkspaceScope,
  WorkspaceSource,
} from '@ddlbuilder/shared-types/workspace';
import {
  clearWorkspaceSession,
  DEFAULT_DRAFT_ID,
  deleteDraft,
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
  createDraft: (draftId: string, state: PersistedState) => void;
  deleteDraftById: (draftId: string) => void;
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

  const activeSourceRef = useRef<WorkspaceSource>({
    kind: 'draft',
    draftId: DEFAULT_DRAFT_ID,
  });
  const draftsRef = useRef<Map<string, GlobalDraftRecord>>(new Map());

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
        summaries.push(buildDraftSummary(draftId, record.state, record.updatedAt, record.folderId));
      }
      draftsRef.current = map;
      setDraftSummaries(summaries);
    },
    [],
  );

  const getDraftState = useCallback((draftId: string) => {
    return draftsRef.current.get(draftId)?.state ?? null;
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
        const draftRecord: GlobalDraftRecord = {
          updatedAt: Date.now(),
          state,
        };
        draftsRef.current.set(source.draftId, draftRecord);
        setDraftSummaries((prev) => {
          const next = prev.filter((d) => d.draftId !== source.draftId);
          const folderId = prev.find((d) => d.draftId === source.draftId)?.folderId;
          next.push(buildDraftSummary(source.draftId, state, Date.now(), folderId));
          return next;
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
        const draftRecord: GlobalDraftRecord = {
          updatedAt: Date.now(),
          state: payload.state,
        };
        draftsRef.current.set(draftId, draftRecord);
        setDraftSummaries((prev) => {
          const next = prev.filter((d) => d.draftId !== draftId);
          const folderId = prev.find((d) => d.draftId === draftId)?.folderId;
          next.push(buildDraftSummary(draftId, payload.state, Date.now(), folderId));
          return next;
        });
        fireAndForget(writeDraft(draftId, draftRecord, currentScope));
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
    (draftId: string, state: PersistedState) => {
      if (shareId) return;
      const draftRecord: GlobalDraftRecord = {
        updatedAt: Date.now(),
        state,
      };
      draftsRef.current.set(draftId, draftRecord);
      setDraftSummaries((prev) => {
        const next = prev.filter((d) => d.draftId !== draftId);
        next.push(buildDraftSummary(draftId, state, Date.now()));
        return next;
      });
      fireAndForget(writeDraft(draftId, draftRecord, currentScope));
    },
    [currentScope, shareId],
  );

  const deleteDraftById = useCallback(
    (draftId: string) => {
      if (shareId) return;
      draftsRef.current.delete(draftId);
      setDraftSummaries((prev) => prev.filter((d) => d.draftId !== draftId));
      fireAndForget(deleteDraft(draftId, currentScope));

      if (activeSourceRef.current.kind === 'draft' && activeSourceRef.current.draftId === draftId) {
        syncActiveSource({ kind: 'draft', draftId: DEFAULT_DRAFT_ID });
        fireAndForget(clearWorkspaceSession(currentScope));
        setPersistedState(null);
      }
    },
    [currentScope, shareId, syncActiveSource],
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
        if (cancelled) return;

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
  };
}
