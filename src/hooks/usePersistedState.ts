import { useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useCallback, useRef } from 'react';
import type { PersistedState } from '@/types';
import { buildShareStateQueryKey } from '@/queryKeys/share';
import { ShareApiError, getShareState } from '@/services/shareService';
import type {
  GlobalDraftSummary,
  WorkspaceSavePayload,
  WorkspaceSource,
} from '@/types/workspace';
import { STORAGE_KEY } from '@/utils/constants';
import {
  clearGlobalDraft,
  clearWorkspaceSession,
  readGlobalDraft,
  readWorkspaceSession,
  writeGlobalDraft,
  writeWorkspaceSession,
  type WorkspaceGlobalDraftRecord,
  type WorkspaceSessionRecord,
} from '@/utils/workspaceStateDb';
import { getSavedTable } from '@/utils/savedTablesDb';

const SHARE_CACHE_GC_TIME_MS = 15 * 60 * 1000;
const SHARE_UUID_REGEX =
  /^\/share\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

type ShareLoadStatus = 'idle' | 'not_found' | 'error';

type GlobalDraftRecord = WorkspaceGlobalDraftRecord;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toText = (value: unknown, fallback = '') =>
  typeof value === 'string' ? value : fallback;

const toNumber = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const normalizePersistedState = (value: unknown): PersistedState | null => {
  if (!isRecord(value)) return null;

  const rows = Array.isArray(value.rows) ? value.rows : [];
  const currentIndexFields = Array.isArray(value.currentIndexFields)
    ? value.currentIndexFields
    : [];
  const indexes = Array.isArray(value.indexes) ? value.indexes : [];
  const authObjects = Array.isArray(value.authObjects)
    ? value.authObjects.filter(
        (item): item is string => typeof item === 'string',
      )
    : [];

  const normalized: PersistedState = {
    tableName: toText(value.tableName),
    tableComment: toText(value.tableComment),
    dbType: toText(value.dbType, 'mysql') as PersistedState['dbType'],
    rows: rows.map((row, index) => {
      if (!isRecord(row)) {
        return {
          order: index + 1,
          fieldName: '',
          fieldType: '',
          fieldComment: '',
          nullable: '是',
          defaultKind: '无',
          defaultValue: '',
          onUpdate: '无',
        };
      }

      return {
        order: toNumber(row.order, index + 1),
        fieldName: toText(row.fieldName),
        fieldType: toText(row.fieldType),
        fieldComment: toText(row.fieldComment),
        nullable: row.nullable === '否' ? '否' : '是',
        defaultKind: toText(row.defaultKind, '无'),
        defaultValue: toText(row.defaultValue),
        onUpdate: toText(row.onUpdate, '无'),
      };
    }),
    addCount: toNumber(value.addCount, 10),
    indexInput: toText(value.indexInput),
    currentIndexFields: currentIndexFields
      .map((item) => {
        if (!isRecord(item)) return null;
        const name = toText(item.name);
        if (!name) return null;
        return {
          name,
          direction: item.direction === 'DESC' ? 'DESC' : 'ASC',
        };
      })
      .filter(Boolean) as PersistedState['currentIndexFields'],
    indexes: indexes
      .map((item) => {
        if (!isRecord(item)) return null;
        const name = toText(item.name);
        if (!name) return null;
        const fields = Array.isArray(item.fields)
          ? item.fields
              .map((field) => {
                if (!isRecord(field)) return null;
                const fieldName = toText(field.name);
                if (!fieldName) return null;
                return {
                  name: fieldName,
                  direction: field.direction === 'DESC' ? 'DESC' : 'ASC',
                };
              })
              .filter(Boolean)
          : [];
        return {
          id: toText(item.id, `idx_${Date.now()}_${Math.random()}`),
          name,
          fields: fields as PersistedState['indexes'][number]['fields'],
          unique: item.unique === true,
          isPrimary: item.isPrimary === true,
        };
      })
      .filter(Boolean) as PersistedState['indexes'],
    authInput: toText(value.authInput),
    authObjects,
  };

  if (isRecord(value.citusShardingConfig)) {
    normalized.citusShardingConfig =
      value.citusShardingConfig as PersistedState['citusShardingConfig'];
  }
  if (isRecord(value.mysqlPartitionConfig)) {
    normalized.mysqlPartitionConfig =
      value.mysqlPartitionConfig as PersistedState['mysqlPartitionConfig'];
  }
  if (isRecord(value.tableMiscConfig)) {
    normalized.tableMiscConfig =
      value.tableMiscConfig as PersistedState['tableMiscConfig'];
  }
  if (isRecord(value.fieldTableViewConfig)) {
    normalized.fieldTableViewConfig =
      value.fieldTableViewConfig as PersistedState['fieldTableViewConfig'];
  }

  return normalized;
};

const isWorkspaceSource = (value: unknown): value is WorkspaceSource => {
  if (!isRecord(value) || typeof value.kind !== 'string') return false;
  if (value.kind === 'global_draft') return true;
  if (value.kind !== 'saved_table') return false;
  return (
    typeof value.normalizedName === 'string' &&
    value.normalizedName.length > 0 &&
    typeof value.tableName === 'string' &&
    typeof value.baseSignature === 'string'
  );
};

const isSameWorkspaceSource = (a: WorkspaceSource, b: WorkspaceSource) => {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'global_draft' && b.kind === 'global_draft') return true;
  if (a.kind === 'saved_table' && b.kind === 'saved_table') {
    return (
      a.normalizedName === b.normalizedName &&
      a.tableName === b.tableName &&
      a.baseSignature === b.baseSignature
    );
  }
  return false;
};

const writeStorageJson = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore localStorage quota errors
  }
};

const removeStorage = (key: string) => {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore localStorage errors
  }
};

const fireAndForget = (task: Promise<unknown>) => {
  void task.catch(() => {
    // ignore persistence errors
  });
};

const buildShareStorageKey = (shareId: string) =>
  `${STORAGE_KEY}:share:${shareId}`;

const parseSharePath = (
  pathname: string,
): { shareId: string | null; invalid: boolean } => {
  if (!pathname.startsWith('/share/')) {
    return { shareId: null, invalid: false };
  }
  const match = pathname.match(SHARE_UUID_REGEX);
  if (!match) {
    return { shareId: null, invalid: true };
  }
  return { shareId: match[1], invalid: false };
};

const buildGlobalDraftSummary = (
  state: PersistedState,
  updatedAt: number,
): GlobalDraftSummary => {
  const fieldCount = state.rows.filter((row) => row.fieldName?.trim()).length;
  const name = state.tableName.trim() || '未命名草稿';
  return {
    name,
    dbType: state.dbType,
    fieldCount,
    updatedAt,
  };
};

const normalizeGlobalDraftRecord = (
  value: unknown,
): GlobalDraftRecord | null => {
  if (!isRecord(value)) return null;
  const state = normalizePersistedState(value.state);
  if (!state) return null;

  return {
    id: toText(value.id, 'global_draft'),
    name: toText(value.name, 'Global Draft'),
    dbType: toText(value.dbType, 'mysql') as PersistedState['dbType'],
    fieldCount: toNumber(value.fieldCount, 0),
    updatedAt: toNumber(value.updatedAt, Date.now()),
    state,
  };
};

const normalizeWorkspaceSession = (
  value: unknown,
): WorkspaceSessionRecord | null => {
  if (!isRecord(value)) return null;
  if (!isWorkspaceSource(value.activeSource)) return null;

  return {
    id: toText(value.id, 'session'),
    activeSource: value.activeSource,
    activeState: normalizePersistedState(value.activeState),
    updatedAt: toNumber(value.updatedAt, Date.now()),
  };
};

// Helper for local serialization if needed
const serializePersistedState = (state: PersistedState): string => {
  return JSON.stringify(state);
};

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
  setWorkspaceSnapshot: (
    source: WorkspaceSource,
    state: PersistedState,
  ) => void;
}

export function usePersistedState(): UsePersistedStateReturn {
  const queryClient = useQueryClient();
  const pathInfo = parseSharePath(window.location.pathname);
  const shareId = pathInfo.shareId;
  const shareStorageKey = shareId ? buildShareStorageKey(shareId) : null;
  const [hydrated, setHydrated] = useState(false);
  const [persistedState, setPersistedState] =
    useState<PersistedState | null>(null);
  const [shareLoadStatus, setShareLoadStatus] =
    useState<ShareLoadStatus>('idle');
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [isShareView, setIsShareView] = useState(false);
  const [activeSource, setActiveSource] = useState<WorkspaceSource>({
    kind: 'global_draft',
  });
  const [globalDraftSummary, setGlobalDraftSummary] =
    useState<GlobalDraftSummary | null>(null);

  const activeSourceRef = useRef<WorkspaceSource>({
    kind: 'global_draft',
  });
  const globalDraftRef = useRef<GlobalDraftRecord | null>(null);

  const syncActiveSource = useCallback((source: WorkspaceSource) => {
    activeSourceRef.current = source;
    setActiveSource((prev) =>
      isSameWorkspaceSource(prev, source) ? prev : source,
    );
  }, []);

  const updateGlobalDraft = useCallback((record: GlobalDraftRecord | null) => {
    globalDraftRef.current = record;
    setGlobalDraftSummary(
      record ? buildGlobalDraftSummary(record.state, record.updatedAt) : null,
    );
  }, []);

  const getGlobalDraftState = useCallback(() => {
    return globalDraftRef.current?.state ?? null;
  }, []);

  const setWorkspaceSnapshot = useCallback(
    (source: WorkspaceSource, state: PersistedState) => {
      if (shareId) return;

      syncActiveSource(source);
      setPersistedState(state); // Update the displayed state immediately

      if (source.kind === 'global_draft') {
        const globalRecord: GlobalDraftRecord = {
          id: 'global_draft',
          name: 'Global Draft',
          dbType: state.dbType,
          fieldCount: state.rows.filter((r) => r.fieldName?.trim()).length,
          updatedAt: Date.now(),
          state,
        };
        updateGlobalDraft(globalRecord);
        fireAndForget(writeGlobalDraft(globalRecord));
      }

      fireAndForget(
        writeWorkspaceSession({
          id: 'session',
          activeSource: source,
          activeState: state,
          updatedAt: Date.now(),
        }),
      );
    },
    [shareId, syncActiveSource, updateGlobalDraft],
  );

  const saveState = useCallback(
    (payload: WorkspaceSavePayload) => {
      if (!hydrated) return;

      if (shareStorageKey) {
        writeStorageJson(shareStorageKey, payload.state);
        setPersistedState(payload.state); // Update displayed state
        return;
      }

      const currentSource = activeSourceRef.current;
      if (!isSameWorkspaceSource(payload.source, currentSource)) {
        console.log('[DEBUG] saveState - 源不匹配，跳过保存');
        return;
      }

      setPersistedState(payload.state); // Update displayed state

      if (payload.source.kind === 'global_draft') {
        const globalRecord: GlobalDraftRecord = {
          id: 'global_draft',
          name: 'Global Draft',
          dbType: payload.state.dbType,
          fieldCount: payload.state.rows.filter((r) => r.fieldName?.trim())
            .length,
          updatedAt: Date.now(),
          state: payload.state,
        };
        updateGlobalDraft(globalRecord);
        fireAndForget(writeGlobalDraft(globalRecord));
      } 
      
      const activeStateToPersist = payload.source.kind === 'saved_table' ? null : payload.state;

      fireAndForget(
        writeWorkspaceSession({
          id: 'session',
          activeSource: payload.source,
          activeState: activeStateToPersist,
          updatedAt: Date.now(),
        }),
      );
      syncActiveSource(payload.source);
    },
    [hydrated, shareStorageKey, syncActiveSource, updateGlobalDraft],
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
      fireAndForget(clearGlobalDraft());
    }

    syncActiveSource({ kind: 'global_draft' });
    fireAndForget(clearWorkspaceSession());
    setPersistedState(null);
  }, [activeSource, shareStorageKey, syncActiveSource, updateGlobalDraft]);

  // restore from workspace or share link once on mount
  useEffect(() => {
    let cancelled = false;

    const hydrateWithState = (state: PersistedState | null) => {
      if (cancelled) return;
      setPersistedState(state);
      setHydrated(true);
    };

    const hydrateMainWorkspace = async () => {
      const [globalDraftRaw, sessionRaw] = await Promise.all([
        readGlobalDraft().catch(() => null),
        readWorkspaceSession().catch(() => null),
      ]);

      const globalDraftRecord = normalizeGlobalDraftRecord(globalDraftRaw);
      const session = normalizeWorkspaceSession(sessionRaw);

      updateGlobalDraft(globalDraftRecord);

      if (!session) {
        syncActiveSource({ kind: 'global_draft' });
        hydrateWithState(globalDraftRecord?.state ?? null);
        return;
      }

      if (session.activeSource.kind === 'saved_table') {
        // Try to load the saved table from DB
        try {
           const savedTable = await getSavedTable(session.activeSource.normalizedName);
           if (savedTable) {
             syncActiveSource({
               kind: 'saved_table',
               normalizedName: savedTable.normalizedName,
               tableName: savedTable.name,
               baseSignature: serializePersistedState(savedTable.state),
             });
             // Always hydrate with the CLEAN state from DB
             hydrateWithState(savedTable.state);
             return;
           }
        } catch (e) {
           console.error('Failed to load saved table for session:', e);
        }

        // Fallback: Global Draft if saved table missing
        syncActiveSource({ kind: 'global_draft' });
        hydrateWithState(globalDraftRecord?.state ?? null);
        return;
      }

      // Default: Global Draft
      syncActiveSource({ kind: 'global_draft' });
      // If session.activeState exists and is for Global Draft, use it
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
      void hydrateMainWorkspace();
      return () => {
        cancelled = true;
      };
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
        if (
          error instanceof ShareApiError &&
          error.code === 'SHARE_NOT_FOUND'
        ) {
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
    syncActiveSource,
    updateGlobalDraft,
  ]);

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
