import { rememberWorkspaceCache } from '@/services/workspaceCacheRegistry';
import { watchWorkspaceHistory } from '@/services/workspaceHistoryCleanup';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type PropsWithChildren,
} from 'react';
import * as Y from 'yjs';
import { fetchUpdates, IndexeddbPersistence } from 'y-indexeddb';
import type { UserWorkspaceScope } from '@ddlbuilder/shared-types/workspace';
import { useAuthActions, useAuthIdentity } from '@/auth/AuthSessionProvider';
import { WorkspaceBootstrapScreen } from '@/components/WorkspaceBootstrapScreen';
import { useShareRoute } from '@/hooks/workspacePersistence/shareRoute';
import {
  beginLegacyWorkspaceMigration,
  completeLegacyWorkspaceMigration,
  isLegacyWorkspaceMigrationCompleted,
} from '@/services/workspaceLegacyMigrationMarker';
import { prepareLegacyWorkspaceSnapshot } from '@/services/workspaceMigrationService';
import {
  initializeOrMigrateWorkspaceYDoc,
  mergeWorkspaceSnapshotIntoYDoc,
} from '@/services/workspaceYDocAdapter';
import {
  WorkspaceYDocSyncClient,
  type WorkspaceYDocConnectionState,
  type WorkspaceYDocConnectionStatus,
  type WorkspaceYDocFailureReason,
} from '@/services/workspaceYDocSyncClient';
import {
  buildWorkspaceYDocName,
  commitLegacyWorkspaceYDoc,
  LEGACY_MIGRATION_COMMITTED,
  registerWorkspaceYDocOwner,
} from '@/services/workspaceYDocStorage';
import {
  clearLegacyWorkspaceData,
  retryPendingWorkspaceCleanup,
} from '@/services/workspaceAccountService';
import { isWorkspaceWriteTargetPending } from '@/services/workspaceYDocAuthority';
import { useAppUiStore, useEditorStore, useTabStore } from '@/stores';

type WorkspaceYDocContextValue = {
  doc: Y.Doc | null;
  scope: UserWorkspaceScope | null;
  synced: boolean;
  localSynced: boolean;
  remoteLoaded: boolean;
  connectionState: WorkspaceYDocConnectionState;
  failureReason?: WorkspaceYDocFailureReason;
  retry: () => void;
};

const noop = () => {};

/**
 * 门禁期间 children 不渲染，任何一段可能永不结束的等待都必须有逃生口，否则用户永久白屏。
 * 覆盖两条：whenSynced 只 resolve 从不 reject（IndexedDB 打不开时永远 pending），
 * 以及 /api/workspaces 失败后 workspaceId 一直是 null。
 * 取值依据：y-indexeddb 把 updates store 裁剪到 ~500 条，本地读取是有界的（正常几十毫秒，
 * 慢设备冷启动 1s 量级），余下耗时几乎都在 indexedDB.open()；10s 留了一个数量级的余量，
 * 与 WORKSPACE_YDOC_CONNECT_TIMEOUT_MS(8s) 同量级。
 */
const WORKSPACE_BOOTSTRAP_TIMEOUT_MS = 10_000;
const REMOTE_LOADED = 'remote-loaded';

const hasCompletedLegacyMigration = (userId: string | null, workspaceId: string | null) =>
  Boolean(
    userId &&
    workspaceId &&
    isLegacyWorkspaceMigrationCompleted({ kind: 'user', userId, workspaceId }),
  );

type WorkspaceYDocDocument = Pick<
  WorkspaceYDocContextValue,
  'doc' | 'scope' | 'localSynced' | 'retry'
>;

type WorkspaceYDocStatus = Omit<WorkspaceYDocContextValue, keyof WorkspaceYDocDocument>;

const WorkspaceYDocDocumentContext = createContext<WorkspaceYDocDocument>({
  doc: null,
  scope: null,
  localSynced: false,
  retry: noop,
});
const WorkspaceYDocStatusContext = createContext<WorkspaceYDocStatus>({
  synced: false,
  remoteLoaded: false,
  connectionState: 'idle',
});

type WorkspaceYDocValue = Omit<WorkspaceYDocContextValue, 'retry'>;

type BootstrapCleanup = { attempt: number; status: 'ready' | 'error' };

type WorkspaceYDocProviderState = {
  bootstrapAttempt: number;
  cleanup: BootstrapCleanup | null;
  timedOutAttempt: number | null;
  value: WorkspaceYDocValue;
};

type WorkspaceYDocValueEvent =
  | { type: 'scopeCleared' }
  | { type: 'cacheRegistrationFailed'; scope: UserWorkspaceScope }
  | { type: 'docOpened'; doc: Y.Doc; scope: UserWorkspaceScope }
  | {
      type: 'docDisposed';
      doc: Y.Doc;
      scope: UserWorkspaceScope;
      connectionState: 'idle' | 'error';
    }
  | { type: 'localLoaded'; doc: Y.Doc; remoteLoaded: boolean }
  | { type: 'initializeFailed' }
  | { type: 'syncDisabled' }
  | { type: 'syncStatusChanged'; status: WorkspaceYDocConnectionStatus };

type WorkspaceYDocProviderEvent =
  | { type: 'bootstrapRetried' }
  | ({ type: 'cleanupSettled' } & BootstrapCleanup)
  | { type: 'bootstrapTimedOut'; attempt: number }
  | WorkspaceYDocValueEvent;

const EMPTY_VALUE: WorkspaceYDocValue = {
  doc: null,
  scope: null,
  synced: false,
  localSynced: false,
  remoteLoaded: false,
  connectionState: 'idle',
};

const INITIAL_PROVIDER_STATE: WorkspaceYDocProviderState = {
  bootstrapAttempt: 0,
  cleanup: null,
  timedOutAttempt: null,
  value: EMPTY_VALUE,
};

const reduceValue = (
  value: WorkspaceYDocValue,
  event: WorkspaceYDocValueEvent,
): WorkspaceYDocValue => {
  switch (event.type) {
    case 'scopeCleared':
      return EMPTY_VALUE;
    case 'cacheRegistrationFailed':
      return {
        ...value,
        doc: null,
        scope: event.scope,
        localSynced: false,
        connectionState: 'error',
        failureReason: 'unknown',
      };
    case 'docOpened':
      return { ...EMPTY_VALUE, doc: event.doc, scope: event.scope };
    case 'docDisposed':
      if (value.doc !== event.doc) return value;

      return {
        ...EMPTY_VALUE,
        scope: event.scope,
        connectionState: event.connectionState,
        failureReason: event.connectionState === 'error' ? 'unknown' : undefined,
      };
    case 'localLoaded':
      return { ...value, doc: event.doc, localSynced: true, remoteLoaded: event.remoteLoaded };
    case 'initializeFailed':
      return { ...value, connectionState: 'error', failureReason: 'unknown' };
    case 'syncDisabled':
      return { ...value, synced: false, connectionState: 'idle', failureReason: undefined };
    case 'syncStatusChanged':
      if (
        value.connectionState === event.status.state &&
        value.failureReason === event.status.failureReason &&
        value.synced === event.status.synced
      )
        return value;

      return {
        ...value,
        connectionState: event.status.state,
        failureReason: event.status.failureReason,
        synced: event.status.synced,
        remoteLoaded: value.remoteLoaded || event.status.synced,
      };
  }
};

const workspaceYDocProviderReducer = (
  state: WorkspaceYDocProviderState,
  event: WorkspaceYDocProviderEvent,
): WorkspaceYDocProviderState => {
  switch (event.type) {
    case 'bootstrapRetried':
      return { ...state, bootstrapAttempt: state.bootstrapAttempt + 1 };
    case 'cleanupSettled':
      return { ...state, cleanup: { attempt: event.attempt, status: event.status } };
    case 'bootstrapTimedOut':
      return { ...state, timedOutAttempt: event.attempt };
    default: {
      const value = reduceValue(state.value, event);

      return value === state.value ? state : { ...state, value };
    }
  }
};

export function WorkspaceYDocProvider({ children }: PropsWithChildren) {
  const authSession = useAuthIdentity();
  const { refreshSession } = useAuthActions();
  const { shareId } = useShareRoute();
  const clientRef = useRef<WorkspaceYDocSyncClient | null>(null);
  const persistenceRef = useRef<IndexeddbPersistence | null>(null);

  const [{ bootstrapAttempt, cleanup, timedOutAttempt, value }, dispatch] = useReducer(
    workspaceYDocProviderReducer,
    INITIAL_PROVIDER_STATE,
  );

  const cleanupReady = cleanup?.attempt === bootstrapAttempt && cleanup.status === 'ready';
  useEffect(() => {
    let cancelled = false;
    void retryPendingWorkspaceCleanup().then(
      () => {
        if (!cancelled)
          dispatch({ type: 'cleanupSettled', attempt: bootstrapAttempt, status: 'ready' });
      },
      // oxlint-disable-next-line anti-slop/no-unknown-parameters -- cleanup promises can reject with any JavaScript value.
      (error: unknown) => {
        console.error('[workspace] pending cleanup failed', error);

        if (!cancelled)
          dispatch({ type: 'cleanupSettled', attempt: bootstrapAttempt, status: 'error' });
      },
    );

    return () => {
      cancelled = true;
    };
  }, [bootstrapAttempt]);

  const retry = useCallback(() => {
    const client = clientRef.current;
    void refreshSession()
      .then(() => {
        if (clientRef.current === client) client?.retry();
      })
      // oxlint-disable-next-line anti-slop/no-unknown-parameters -- session refresh can reject with any JavaScript value.
      .catch((error: unknown) => {
        console.error('[workspace-yjs] failed to refresh session before retry', error);
      });
  }, [refreshSession]);

  const workspaceUserId = authSession.workspaceScope?.userId ?? null;
  const workspaceId = authSession.workspaceScope?.workspaceId ?? null;

  useEffect(() => {
    if (shareId) return;
    useTabStore.setState({ tabs: [], activeTabId: null });
    useEditorStore.getState().resetDocument();
    useAppUiStore.setState({ activeDialog: { kind: 'none' } });
  }, [workspaceUserId, workspaceId, shareId]);

  useEffect(() => {
    if (!cleanupReady) return;

    if (!workspaceUserId || !workspaceId) {
      dispatch({ type: 'scopeCleared' });

      return;
    }

    let cancelled = false;
    const scope: UserWorkspaceScope = { kind: 'user', userId: workspaceUserId, workspaceId };

    try {
      rememberWorkspaceCache(scope);
    } catch (error) {
      console.error('[workspace] failed to register offline cache', error);
      dispatch({ type: 'cacheRegistrationFailed', scope });

      return;
    }

    const doc = new Y.Doc();
    const persistence = new IndexeddbPersistence(buildWorkspaceYDocName(workspaceId), doc);
    persistenceRef.current = persistence;
    let disposal: Promise<void> | null = null;

    const dispose = (connectionState: 'idle' | 'error' = 'error') => {
      if (disposal) return disposal;
      cancelled = true;
      clientRef.current?.destroy();
      clientRef.current = null;
      persistenceRef.current = null;
      doc.destroy();
      dispatch({ type: 'docDisposed', doc, scope, connectionState });
      disposal = persistence.destroy().finally(unregister);

      return disposal;
    };
    const unregister = registerWorkspaceYDocOwner(workspaceId, {
      dispose,
      prepareSignOut: async () => {
        const client = clientRef.current;

        if (!client || cancelled) throw new Error('Workspace is not ready');
        await fetchUpdates(persistence);

        if (cancelled || clientRef.current !== client) throw new Error('Workspace changed');
        await client.flushAndWaitForSync();
      },
    });

    dispatch({ type: 'docOpened', doc, scope });

    const initialize = async () => {
      await persistence.whenSynced;

      if (cancelled) return;
      initializeOrMigrateWorkspaceYDoc(doc);

      if (persistence.db)
        persistence.db.onversionchange = () => {
          void dispose().catch(console.error);
        };

      try {
        const token = beginLegacyWorkspaceMigration(scope);
        const committed = await persistence.get(LEGACY_MIGRATION_COMMITTED);

        if (!committed && !hasCompletedLegacyMigration(workspaceUserId, workspaceId)) {
          const snapshot = await prepareLegacyWorkspaceSnapshot(scope);

          if (cancelled) return;

          if (snapshot) mergeWorkspaceSnapshotIntoYDoc(doc, snapshot);
        }

        if (cancelled) return;

        if (!committed) await commitLegacyWorkspaceYDoc(persistence, doc);

        if (cancelled) return;
        await clearLegacyWorkspaceData(scope);
        completeLegacyWorkspaceMigration(scope, token);
      } catch (error) {
        console.error('[workspace-yjs] legacy snapshot merge failed', error);
        throw error;
      }

      const remoteLoaded = (await persistence.get(REMOTE_LOADED)) === 1;

      if (cancelled) return;
      dispatch({ type: 'localLoaded', doc, remoteLoaded });
    };

    void initialize().catch((error) => {
      console.error('[workspace-yjs] initialize failed', error);

      if (!cancelled) dispatch({ type: 'initializeFailed' });
    });

    return () => {
      void dispose('idle').catch(() => {});
    };
  }, [workspaceUserId, workspaceId, bootstrapAttempt, cleanupReady]);

  const sameWorkspace =
    (value.scope?.userId ?? null) === workspaceUserId &&
    (value.scope?.workspaceId ?? null) === workspaceId;
  const doc = sameWorkspace ? value.doc : null;
  const localSynced = sameWorkspace && value.localSynced;
  const canSync = authSession.status === 'signed_in' && authSession.userId === workspaceUserId;

  useEffect(() => {
    if (!doc || !localSynced || !value.scope || !value.remoteLoaded) return;

    return watchWorkspaceHistory(doc, value.scope);
  }, [doc, localSynced, value.scope, value.remoteLoaded]);

  useEffect(() => {
    if (!doc || !localSynced || !workspaceId) return;

    if (!canSync) {
      dispatch({ type: 'syncDisabled' });

      return;
    }

    let cancelled = false;
    let rememberedRemote = false;
    const persistence = persistenceRef.current;

    const client = new WorkspaceYDocSyncClient(workspaceId, doc, (status) => {
      if (cancelled) return;
      dispatch({ type: 'syncStatusChanged', status });

      if (status.synced && !rememberedRemote) {
        rememberedRemote = true;
        // oxlint-disable-next-line anti-slop/no-unknown-parameters -- persistence writes can reject with any JavaScript value.
        void persistence?.set(REMOTE_LOADED, 1).catch((error: unknown) => {
          console.error('[workspace-yjs] failed to remember initial cloud sync', error);
        });
      }
    });
    clientRef.current = client;
    void client.connect();

    return () => {
      cancelled = true;
      client.destroy();

      if (clientRef.current === client) clientRef.current = null;
    };
  }, [canSync, doc, localSynced, workspaceId]);

  const documentValue = useMemo(
    () => ({ doc, scope: value.scope, localSynced, retry }),
    [doc, value.scope, localSynced, retry],
  );
  const statusValue = useMemo(
    () => ({
      synced: value.synced,
      remoteLoaded: value.remoteLoaded,
      connectionState: value.connectionState,
      failureReason: value.failureReason,
    }),
    [value.synced, value.remoteLoaded, value.connectionState, value.failureReason],
  );
  // 分享页读的是分享快照而非 Y.Doc，工作区写入入口全部关闭，挡住它只会让本可展示的页面白屏。
  const blocked =
    !shareId &&
    (!cleanupReady ||
      !sameWorkspace ||
      isWorkspaceWriteTargetPending({
        authStatus: authSession.status,
        userId: workspaceUserId ?? authSession.userId,
        localSynced,
      }));

  useEffect(() => {
    if (!blocked) return;

    const timer = setTimeout(
      () => dispatch({ type: 'bootstrapTimedOut', attempt: bootstrapAttempt }),
      WORKSPACE_BOOTSTRAP_TIMEOUT_MS,
    );

    return () => clearTimeout(timer);
  }, [blocked, bootstrapAttempt]);

  const bootstrapTimedOut = timedOutAttempt === bootstrapAttempt;

  // 门禁期可能卡在两处：Y.Doc 本地加载，或 workspaceId 还没落地。前者要重跑启动流程，
  // 后者只有重新解析会话才能拿到 workspaceId，所以两件事都做。
  const retryBootstrap = useCallback(() => {
    dispatch({ type: 'bootstrapRetried' });
    void refreshSession();
  }, [refreshSession]);

  return (
    <WorkspaceYDocDocumentContext.Provider value={documentValue}>
      <WorkspaceYDocStatusContext.Provider value={statusValue}>
        {blocked ? (
          <WorkspaceBootstrapScreen
            failed={
              bootstrapTimedOut ||
              value.connectionState === 'error' ||
              (cleanup?.attempt === bootstrapAttempt && cleanup.status === 'error')
            }
            onRetry={retryBootstrap}
          />
        ) : (
          children
        )}
      </WorkspaceYDocStatusContext.Provider>
    </WorkspaceYDocDocumentContext.Provider>
  );
}

export const useWorkspaceYDocDocument = () => useContext(WorkspaceYDocDocumentContext);
export const useWorkspaceYDoc = () => ({
  ...useWorkspaceYDocDocument(),
  ...useContext(WorkspaceYDocStatusContext),
});
