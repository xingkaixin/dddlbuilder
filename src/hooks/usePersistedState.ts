import { useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { PersistedState } from '@/types';
import { useAuthSession } from '@/auth/AuthSessionProvider';
import { buildShareStateQueryKey } from '@/queryKeys/share';
import { ShareApiError, getShareState } from '@/services/shareService';
import { WORKSPACE_SNAPSHOT_APPLIED_EVENT } from '@/services/workspaceSyncService';
import type {
  GlobalDraftSummary,
  WorkspaceSavePayload,
  WorkspaceScope,
  WorkspaceSource,
} from '@/types/workspace';
import {
  clearGlobalDraft,
  clearWorkspaceSession,
  writeGlobalDraft,
  writeWorkspaceSession,
} from '@/utils/workspaceStateDb';
import { getWorkspaceBootstrap } from './workspacePersistence/bootstrap';
import { resetWorkspaceBootstrapCache } from './workspacePersistence/bootstrap';
import { getAnonymousWorkspaceScope, setCurrentWorkspaceScope } from '@/utils/workspaceScope';
import {
  buildGlobalDraftSummary,
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
  globalDraftSummary: GlobalDraftSummary | null;
  getGlobalDraftState: () => PersistedState | null;
  setWorkspaceSnapshot: (source: WorkspaceSource, state: PersistedState) => void;
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
    kind: 'global_draft',
  });
  const [globalDraftSummary, setGlobalDraftSummary] = useState<GlobalDraftSummary | null>(null);

  const activeSourceRef = useRef<WorkspaceSource>({
    kind: 'global_draft',
  });
  const globalDraftRef = useRef<GlobalDraftRecord | null>(null);

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

  const updateGlobalDraft = useCallback((record: GlobalDraftRecord | null) => {
    globalDraftRef.current = record;
    setGlobalDraftSummary(record ? buildGlobalDraftSummary(record.state, record.updatedAt) : null);
  }, []);

  const getGlobalDraftState = useCallback(() => {
    return globalDraftRef.current?.state ?? null;
  }, []);

  const setWorkspaceSnapshot = useCallback(
    (source: WorkspaceSource, state: PersistedState) => {
      if (shareId) return;

      syncActiveSource(source);
      setPersistedState(state);

      if (source.kind === 'global_draft') {
        const globalRecord: GlobalDraftRecord = {
          updatedAt: Date.now(),
          state,
        };
        updateGlobalDraft(globalRecord);
        fireAndForget(writeGlobalDraft(globalRecord, currentScope));
      }

      const activeState = source.kind === 'global_draft' ? state : null;
      fireAndForget(
        writeWorkspaceSession(
          {
            activeSource: source,
            activeState,
            updatedAt: Date.now(),
          },
          currentScope,
        ),
      );
    },
    [currentScope, shareId, syncActiveSource, updateGlobalDraft],
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

      if (payload.source.kind === 'global_draft') {
        const globalRecord: GlobalDraftRecord = {
          updatedAt: Date.now(),
          state: payload.state,
        };
        updateGlobalDraft(globalRecord);
        fireAndForget(writeGlobalDraft(globalRecord, currentScope));
      }

      const activeStateToPersist = payload.source.kind === 'saved_table' ? null : payload.state;

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
    [currentScope, hydrated, shareStorageKey, syncActiveSource, updateGlobalDraft],
  );

  const clearState = useCallback(() => {
    if (shareStorageKey) {
      removeStorage(shareStorageKey);
      setPersistedState(null);
      return;
    }

    if (activeSource.kind === 'saved_table') {
      // No draft to delete for saved table
    } else {
      updateGlobalDraft(null);
      fireAndForget(clearGlobalDraft(currentScope));
    }

    syncActiveSource({ kind: 'global_draft' });
    fireAndForget(clearWorkspaceSession(currentScope));
    setPersistedState(null);
  }, [activeSource, currentScope, shareStorageKey, syncActiveSource, updateGlobalDraft]);

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
        session: sessionRaw,
        savedTable,
      } = await getWorkspaceBootstrap(currentScope);

      const globalDraftRecord = normalizeGlobalDraftRecord(globalDraftRaw);
      const session = normalizeWorkspaceSession(sessionRaw);

      updateGlobalDraft(globalDraftRecord);

      if (!session) {
        syncActiveSource({ kind: 'global_draft' });
        hydrateWithState(globalDraftRecord?.state ?? null);
        return;
      }

      if (session.activeSource.kind === 'saved_table') {
        if (savedTable) {
          const baseSignature =
            session.activeSource.baseSignature ||
            (typeof (savedTable as { stateSignature?: unknown }).stateSignature === 'string'
              ? (savedTable as { stateSignature?: string }).stateSignature
              : JSON.stringify(savedTable.state));
          syncActiveSource({
            kind: 'saved_table',
            normalizedName: savedTable.normalizedName,
            tableName: savedTable.name,
            baseSignature,
          });
          hydrateWithState(savedTable.state);
          return;
        }

        syncActiveSource({ kind: 'global_draft' });
        hydrateWithState(globalDraftRecord?.state ?? null);
        return;
      }

      syncActiveSource({ kind: 'global_draft' });
      if (session.activeState) {
        hydrateWithState(session.activeState);
      } else {
        hydrateWithState(globalDraftRecord?.state ?? null);
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
    updateGlobalDraft,
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
          session: sessionRaw,
          savedTable,
        } = await getWorkspaceBootstrap(currentScope);
        if (cancelled) return;

        const globalDraftRecord = normalizeGlobalDraftRecord(globalDraftRaw);
        const session = normalizeWorkspaceSession(sessionRaw);
        updateGlobalDraft(globalDraftRecord);

        if (!session) {
          syncActiveSource({ kind: 'global_draft' });
          setPersistedState(globalDraftRecord?.state ?? null);
          setHydrated(true);
          return;
        }

        if (session.activeSource.kind === 'saved_table' && savedTable) {
          syncActiveSource({
            kind: 'saved_table',
            normalizedName: savedTable.normalizedName,
            tableName: savedTable.name,
            baseSignature:
              session.activeSource.baseSignature ||
              (typeof (savedTable as { stateSignature?: unknown }).stateSignature === 'string'
                ? (savedTable as { stateSignature?: string }).stateSignature
                : JSON.stringify(savedTable.state)),
          });
          setPersistedState(savedTable.state);
          setHydrated(true);
          return;
        }

        syncActiveSource({ kind: 'global_draft' });
        setPersistedState(session.activeState ?? globalDraftRecord?.state ?? null);
        setHydrated(true);
      })();
    };

    window.addEventListener(WORKSPACE_SNAPSHOT_APPLIED_EVENT, handleSnapshotApplied);
    return () => {
      cancelled = true;
      window.removeEventListener(WORKSPACE_SNAPSHOT_APPLIED_EVENT, handleSnapshotApplied);
    };
  }, [shareId, authSession.status, currentScope, syncActiveSource, updateGlobalDraft]);

  return {
    persistedState,
    hydrated,
    saveState,
    clearState,
    shareLoadStatus,
    isShareView: Boolean(shareId),
    activeSource,
    globalDraftSummary,
    getGlobalDraftState,
    setWorkspaceSnapshot,
  };
}
