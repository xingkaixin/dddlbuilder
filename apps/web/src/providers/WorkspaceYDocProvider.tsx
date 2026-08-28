import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import * as Y from 'yjs';
import { fetchUpdates, IndexeddbPersistence } from 'y-indexeddb';
import type { UserWorkspaceScope } from '@ddlbuilder/shared-types/workspace';
import { useAuthSession } from '@/auth/AuthSessionProvider';
import { WorkspaceBootstrapScreen } from '@/components/WorkspaceBootstrapScreen';
import { useShareRoute } from '@/hooks/workspacePersistence/shareRoute';
import {
  beginLegacyWorkspaceMigration,
  completeLegacyWorkspaceMigration,
  isLegacyWorkspaceMigrationCompleted,
} from '@/services/workspaceLegacyMigrationMarker';
import { prepareLegacyWorkspaceSnapshot } from '@/services/workspaceMigrationService';
import {
  ensureWorkspaceYDocMeta,
  mergeWorkspaceSnapshotIntoYDoc,
} from '@/services/workspaceYDocAdapter';
import {
  WorkspaceYDocSyncClient,
  type WorkspaceYDocConnectionState,
  type WorkspaceYDocFailureReason,
} from '@/services/workspaceYDocSyncClient';
import {
  buildWorkspaceYDocName,
  commitLegacyWorkspaceYDoc,
  LEGACY_MIGRATION_COMMITTED,
  registerWorkspaceYDocOwner,
} from '@/services/workspaceYDocStorage';
import { clearLegacyWorkspaceData } from '@/services/workspaceAccountService';
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

const WorkspaceYDocContext = createContext<WorkspaceYDocContextValue>({
  doc: null,
  scope: null,
  synced: false,
  localSynced: false,
  remoteLoaded: false,
  connectionState: 'idle',
  retry: noop,
});

export function WorkspaceYDocProvider({ children }: PropsWithChildren) {
  const authSession = useAuthSession();
  const { refreshSession } = authSession;
  const { shareId } = useShareRoute();
  const clientRef = useRef<WorkspaceYDocSyncClient | null>(null);
  const persistenceRef = useRef<IndexeddbPersistence | null>(null);
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  const [timedOutAttempt, setTimedOutAttempt] = useState<number | null>(null);
  const retry = useCallback(() => {
    void refreshSession();
    clientRef.current?.retry();
  }, [refreshSession]);
  const [value, setValue] = useState<Omit<WorkspaceYDocContextValue, 'retry'>>({
    doc: null,
    scope: null,
    synced: false,
    localSynced: false,
    remoteLoaded: false,
    connectionState: 'idle',
  });

  const workspaceUserId = authSession.workspaceScope?.userId ?? null;
  const workspaceId = authSession.workspaceScope?.workspaceId ?? null;

  useEffect(() => {
    if (shareId) return;
    useTabStore.setState({ tabs: [], activeTabId: null });
    useEditorStore.getState().resetDocument();
    useAppUiStore.setState({ activeDialog: { kind: 'none' } });
  }, [workspaceUserId, workspaceId, shareId]);

  useEffect(() => {
    if (!workspaceUserId || !workspaceId) {
      // oxlint-disable-next-line react/set-state-in-effect
      setValue({
        doc: null,
        scope: null,
        synced: false,
        localSynced: false,
        remoteLoaded: false,
        connectionState: 'idle',
      });
      return;
    }

    let cancelled = false;
    const scope: UserWorkspaceScope = { kind: 'user', userId: workspaceUserId, workspaceId };
    const doc = new Y.Doc();
    ensureWorkspaceYDocMeta(doc);
    const persistence = new IndexeddbPersistence(buildWorkspaceYDocName(workspaceId), doc);
    persistenceRef.current = persistence;
    let disposal: Promise<void> | null = null;
    const dispose = () => {
      if (disposal) return disposal;
      cancelled = true;
      clientRef.current?.destroy();
      clientRef.current = null;
      persistenceRef.current = null;
      doc.destroy();
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

    // oxlint-disable-next-line react/set-state-in-effect
    setValue({
      doc,
      scope,
      synced: false,
      localSynced: false,
      remoteLoaded: false,
      connectionState: 'idle',
    });

    const initialize = async () => {
      await persistence.whenSynced;
      if (cancelled) return;
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
      }

      const remoteLoaded = (await persistence.get(REMOTE_LOADED)) === 1;
      if (cancelled) return;
      setValue((prev) => ({ ...prev, doc, localSynced: true, remoteLoaded }));
    };

    void initialize().catch((error) => {
      console.error('[workspace-yjs] initialize failed', error);
      if (!cancelled) {
        setValue((prev) => ({ ...prev, connectionState: 'error', failureReason: 'unknown' }));
      }
    });

    return () => {
      void dispose().catch(() => {});
    };
  }, [workspaceUserId, workspaceId, bootstrapAttempt]);

  const sameWorkspace =
    (value.scope?.userId ?? null) === workspaceUserId &&
    (value.scope?.workspaceId ?? null) === workspaceId;
  const doc = sameWorkspace ? value.doc : null;
  const localSynced = sameWorkspace && value.localSynced;
  const canSync = authSession.status === 'signed_in' && authSession.userId === workspaceUserId;

  useEffect(() => {
    if (!doc || !localSynced || !workspaceId) return;
    if (!canSync) {
      // oxlint-disable-next-line react/set-state-in-effect
      setValue((prev) => ({
        ...prev,
        synced: false,
        connectionState: 'idle',
        failureReason: undefined,
      }));
      return;
    }
    let cancelled = false;
    let rememberedRemote = false;
    const persistence = persistenceRef.current;
    const client = new WorkspaceYDocSyncClient(workspaceId, doc, (status) => {
      if (cancelled) return;
      setValue((prev) => ({
        ...prev,
        connectionState: status.state,
        failureReason: status.failureReason,
        synced: status.synced,
        remoteLoaded: prev.remoteLoaded || status.synced,
      }));
      if (status.synced && !rememberedRemote) {
        rememberedRemote = true;
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

  const memoizedValue = useMemo(
    () => ({ ...value, doc, localSynced, retry }),
    [value, doc, localSynced, retry],
  );
  // 分享页读的是分享快照而非 Y.Doc，工作区写入入口全部关闭，挡住它只会让本可展示的页面白屏。
  const blocked =
    !shareId &&
    (!sameWorkspace ||
      isWorkspaceWriteTargetPending({
        authStatus: authSession.status,
        userId: workspaceUserId ?? authSession.userId,
        localSynced,
      }));

  useEffect(() => {
    if (!blocked) return;
    const timer = setTimeout(
      () => setTimedOutAttempt(bootstrapAttempt),
      WORKSPACE_BOOTSTRAP_TIMEOUT_MS,
    );
    return () => clearTimeout(timer);
  }, [blocked, bootstrapAttempt]);

  const bootstrapTimedOut = timedOutAttempt === bootstrapAttempt;

  // 门禁期可能卡在两处：Y.Doc 本地加载，或 workspaceId 还没落地。前者要重跑启动流程，
  // 后者只有重新解析会话才能拿到 workspaceId，所以两件事都做。
  const retryBootstrap = useCallback(() => {
    setBootstrapAttempt((attempt) => attempt + 1);
    void refreshSession();
  }, [refreshSession]);

  return (
    <WorkspaceYDocContext.Provider value={memoizedValue}>
      {blocked ? (
        <WorkspaceBootstrapScreen failed={bootstrapTimedOut} onRetry={retryBootstrap} />
      ) : (
        children
      )}
    </WorkspaceYDocContext.Provider>
  );
}

export const useWorkspaceYDoc = () => useContext(WorkspaceYDocContext);
