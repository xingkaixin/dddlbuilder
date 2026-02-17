import { useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useCallback, useRef } from 'react';
import type { PersistedState } from '@/types';
import { buildShareStateQueryKey } from '@/queryKeys/share';
import { ShareApiError, getShareState } from '@/services/shareService';
import type {
  GlobalDraftSummary,
  SavedTableDraftRecord,
  WorkspaceSavePayload,
  WorkspaceSource,
} from '@/types/workspace';
import { STORAGE_KEY } from '@/utils/constants';
import {
  clearGlobalDraft,
  clearWorkspaceSession,
  deleteSavedDraft,
  listSavedDrafts,
  migrateLegacyWorkspaceFromLocalStorage,
  readGlobalDraft,
  readWorkspaceSession,
  renameSavedDraftKey,
  upsertSavedDraft,
  writeGlobalDraft,
  writeWorkspaceSession,
  type WorkspaceGlobalDraftRecord,
  type WorkspaceSessionRecord,
} from '@/utils/workspaceStateDb';

const SHARE_CACHE_GC_TIME_MS = 15 * 60 * 1000;
const SHARE_UUID_REGEX =
  /^\/share\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

type ShareLoadStatus = 'idle' | 'not_found' | 'error';

type GlobalDraftRecord = WorkspaceGlobalDraftRecord;

type SavedTableDraftMap = Record<string, SavedTableDraftRecord>;

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
  record: WorkspaceGlobalDraftRecord | null,
): GlobalDraftRecord | null => {
  if (!record) return null;
  const normalizedState = normalizePersistedState(record.state);
  if (!normalizedState) return null;
  return {
    state: normalizedState,
    updatedAt:
      typeof record.updatedAt === 'number' ? record.updatedAt : Date.now(),
  };
};

const normalizeSavedDraftMap = (
  draftMap: Record<string, SavedTableDraftRecord>,
): SavedTableDraftMap => {
  const normalizedMap: SavedTableDraftMap = {};
  for (const [normalizedName, draft] of Object.entries(draftMap)) {
    const normalizedState = normalizePersistedState(draft.state);
    if (!normalizedState) continue;
    if (typeof draft.baseSignature !== 'string') continue;
    if (typeof draft.tableName !== 'string') continue;
    normalizedMap[normalizedName] = {
      state: normalizedState,
      tableName: draft.tableName,
      baseSignature: draft.baseSignature,
      updatedAt:
        typeof draft.updatedAt === 'number' ? draft.updatedAt : Date.now(),
    };
  }
  return normalizedMap;
};

const normalizeWorkspaceSession = (
  session: WorkspaceSessionRecord | null,
): WorkspaceSessionRecord | null => {
  if (!session || !isWorkspaceSource(session.activeSource)) {
    return null;
  }
  return {
    activeSource: session.activeSource,
    activeState: normalizePersistedState(session.activeState),
    updatedAt:
      typeof session.updatedAt === 'number' ? session.updatedAt : Date.now(),
  };
};

const isSavedTableDraftDirty = (draft: SavedTableDraftRecord) =>
  JSON.stringify(draft.state) !== draft.baseSignature;

export interface UsePersistedStateReturn {
  persistedState: Partial<PersistedState> | null;
  hydrated: boolean;
  saveState: (payload: WorkspaceSavePayload) => void;
  clearState: () => void;
  shareLoadStatus: ShareLoadStatus;
  isShareView: boolean;
  activeSource: WorkspaceSource;
  globalDraftSummary: GlobalDraftSummary | null;
  getGlobalDraftState: () => PersistedState | null;
  getSavedTableDraft: (normalizedName: string) => SavedTableDraftRecord | null;
  setWorkspaceSnapshot: (
    source: WorkspaceSource,
    state: PersistedState | null,
  ) => void;
  renameSavedTableDraft: (
    fromNormalizedName: string,
    toNormalizedName: string,
    nextTableName: string,
  ) => void;
  removeSavedTableDraft: (normalizedName: string) => void;
}

export function usePersistedState(): UsePersistedStateReturn {
  const queryClient = useQueryClient();
  const pathInfo = parseSharePath(window.location.pathname);
  const shareId = pathInfo.shareId;
  const shareStorageKey = shareId ? buildShareStorageKey(shareId) : null;
  const [hydrated, setHydrated] = useState(false);
  const [persistedState, setPersistedState] =
    useState<Partial<PersistedState> | null>(null);
  const [shareLoadStatus, setShareLoadStatus] =
    useState<ShareLoadStatus>('idle');
  const [activeSource, setActiveSource] = useState<WorkspaceSource>({
    kind: 'global_draft',
  });
  const [globalDraftSummary, setGlobalDraftSummary] =
    useState<GlobalDraftSummary | null>(null);

  const activeSourceRef = useRef<WorkspaceSource>({
    kind: 'global_draft',
  });
  const globalDraftRef = useRef<GlobalDraftRecord | null>(null);
  const savedDraftMapRef = useRef<SavedTableDraftMap>({});

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

  const getSavedTableDraft = useCallback((normalizedName: string) => {
    return savedDraftMapRef.current[normalizedName] ?? null;
  }, []);

  const setWorkspaceSnapshot = useCallback(
    (source: WorkspaceSource, state: PersistedState | null) => {
      if (shareId) return;

      syncActiveSource(source);

      if (source.kind === 'global_draft' && state) {
        const globalRecord: GlobalDraftRecord = {
          state,
          updatedAt: Date.now(),
        };
        updateGlobalDraft(globalRecord);
        fireAndForget(writeGlobalDraft(globalRecord));
      }

      fireAndForget(
        writeWorkspaceSession({
          activeSource: source,
          activeState: state,
          updatedAt: Date.now(),
        }),
      );
    },
    [shareId, syncActiveSource, updateGlobalDraft],
  );

  const renameSavedTableDraft = useCallback(
    (
      fromNormalizedName: string,
      toNormalizedName: string,
      nextTableName: string,
    ) => {
      if (shareId) return;

      const currentDraft = savedDraftMapRef.current[fromNormalizedName];
      if (!currentDraft) return;

      const nextDraft: SavedTableDraftRecord = {
        ...currentDraft,
        tableName: nextTableName,
        updatedAt: Date.now(),
      };

      const nextDraftMap = { ...savedDraftMapRef.current };
      nextDraftMap[toNormalizedName] = nextDraft;
      if (fromNormalizedName !== toNormalizedName) {
        delete nextDraftMap[fromNormalizedName];
      }
      savedDraftMapRef.current = nextDraftMap;

      const currentSource = activeSourceRef.current;
      if (
        currentSource.kind === 'saved_table' &&
        currentSource.normalizedName === fromNormalizedName
      ) {
        syncActiveSource({
          ...currentSource,
          normalizedName: toNormalizedName,
          tableName: nextTableName,
        });
      }

      fireAndForget(
        renameSavedDraftKey(
          fromNormalizedName,
          toNormalizedName,
          nextTableName,
        ),
      );
    },
    [shareId, syncActiveSource],
  );

  const removeSavedTableDraft = useCallback(
    (normalizedName: string) => {
      if (shareId) return;
      if (!savedDraftMapRef.current[normalizedName]) return;

      const nextDraftMap = { ...savedDraftMapRef.current };
      delete nextDraftMap[normalizedName];
      savedDraftMapRef.current = nextDraftMap;

      fireAndForget(deleteSavedDraft(normalizedName));
    },
    [shareId],
  );

  const saveState = useCallback(
    (payload: WorkspaceSavePayload) => {
      if (!hydrated) return;

      if (shareStorageKey) {
        writeStorageJson(shareStorageKey, payload.state);
        return;
      }

      const currentSource = activeSourceRef.current;
      if (!isSameWorkspaceSource(payload.source, currentSource)) {
        console.log('[DEBUG] saveState - 源不匹配，跳过保存');
        return;
      }

      if (payload.source.kind === 'global_draft') {
        const globalRecord: GlobalDraftRecord = {
          state: payload.state,
          updatedAt: Date.now(),
        };
        updateGlobalDraft(globalRecord);
        fireAndForget(writeGlobalDraft(globalRecord));
      } else if (payload.isDirty) {
        let baseSignatureParsed: {
          tableName?: string;
          tableComment?: string;
          dbType?: string;
        } | null = null;
        try {
          baseSignatureParsed = JSON.parse(payload.source.baseSignature);
        } catch {
          baseSignatureParsed = null;
        }
        const hasCriticalFieldInSignature =
          baseSignatureParsed &&
          (baseSignatureParsed.tableName !== undefined ||
            baseSignatureParsed.tableComment !== undefined ||
            baseSignatureParsed.dbType !== undefined);

        if (hasCriticalFieldInSignature) {
          const originalTableName = baseSignatureParsed?.tableName ?? '';
          const originalTableComment = baseSignatureParsed?.tableComment ?? '';
          const originalDbType = baseSignatureParsed?.dbType ?? 'mysql';
          const currentTableName = payload.state.tableName ?? '';
          const currentTableComment = payload.state.tableComment ?? '';
          const currentDbType = payload.state.dbType ?? 'mysql';
          const hasCriticalChange =
            currentTableName !== originalTableName ||
            currentTableComment !== originalTableComment ||
            currentDbType !== originalDbType;

          if (hasCriticalChange) {
            console.log(
              '[DEBUG] saveState - 跳过保存：表名/类型/中文名已变化，应触发保存对话框',
            );
            return;
          }
        }

        const nextDraftMap = { ...savedDraftMapRef.current };
        nextDraftMap[payload.source.normalizedName] = {
          state: payload.state,
          tableName: payload.source.tableName,
          baseSignature: payload.source.baseSignature,
          updatedAt: Date.now(),
        };
        savedDraftMapRef.current = nextDraftMap;
        fireAndForget(
          upsertSavedDraft(
            payload.source.normalizedName,
            nextDraftMap[payload.source.normalizedName],
          ),
        );
      } else {
        const nextDraftMap = { ...savedDraftMapRef.current };
        delete nextDraftMap[payload.source.normalizedName];
        savedDraftMapRef.current = nextDraftMap;
        fireAndForget(deleteSavedDraft(payload.source.normalizedName));
      }

      fireAndForget(
        writeWorkspaceSession({
          activeSource: payload.source,
          activeState: payload.state,
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
      const nextDraftMap = { ...savedDraftMapRef.current };
      delete nextDraftMap[activeSource.normalizedName];
      savedDraftMapRef.current = nextDraftMap;
      fireAndForget(deleteSavedDraft(activeSource.normalizedName));
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
      await migrateLegacyWorkspaceFromLocalStorage();

      const [globalDraftRaw, savedDraftMapRaw, sessionRaw] = await Promise.all([
        readGlobalDraft().catch(() => null),
        listSavedDrafts().catch(() => ({})),
        readWorkspaceSession().catch(() => null),
      ]);

      const globalDraftRecord = normalizeGlobalDraftRecord(globalDraftRaw);
      const savedDraftMap = normalizeSavedDraftMap(savedDraftMapRaw);
      const session = normalizeWorkspaceSession(sessionRaw);

      updateGlobalDraft(globalDraftRecord);
      savedDraftMapRef.current = savedDraftMap;

      if (!session) {
        syncActiveSource({ kind: 'global_draft' });
        hydrateWithState(globalDraftRecord?.state ?? null);
        return;
      }

      if (session.activeSource.kind === 'saved_table') {
        const draft = savedDraftMap[session.activeSource.normalizedName];
        if (draft && isSavedTableDraftDirty(draft)) {
          syncActiveSource({
            kind: 'saved_table',
            normalizedName: session.activeSource.normalizedName,
            tableName: draft.tableName,
            baseSignature: draft.baseSignature,
          });
          hydrateWithState(draft.state);
          return;
        }

        if (session.activeState) {
          syncActiveSource(session.activeSource);
          hydrateWithState(session.activeState);
          return;
        }

        syncActiveSource({ kind: 'global_draft' });
        hydrateWithState(globalDraftRecord?.state ?? null);
        return;
      }

      syncActiveSource({ kind: 'global_draft' });
      hydrateWithState(session.activeState ?? globalDraftRecord?.state ?? null);
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
    getSavedTableDraft,
    setWorkspaceSnapshot,
    renameSavedTableDraft,
    removeSavedTableDraft,
  };
}
