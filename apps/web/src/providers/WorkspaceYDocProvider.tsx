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
import { IndexeddbPersistence } from 'y-indexeddb';
import type { WorkspaceScope } from '@ddlbuilder/shared-types/workspace';
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
  registerWorkspaceYDocDisposer,
} from '@/services/workspaceYDocStorage';
import { clearLegacyWorkspaceData } from '@/services/workspaceAccountService';
import {
  isWorkspaceWriteTargetPending,
  resolveWorkspaceYDocStartupPlan,
} from '@/services/workspaceYDocAuthority';

type WorkspaceYDocContextValue = {
  doc: Y.Doc | null;
  synced: boolean;
  localSynced: boolean;
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

const hasCompletedLegacyMigration = (userId: string | null, workspaceId: string | null) =>
  Boolean(
    userId &&
    workspaceId &&
    isLegacyWorkspaceMigrationCompleted({ kind: 'user', userId, workspaceId }),
  );

const WorkspaceYDocContext = createContext<WorkspaceYDocContextValue>({
  doc: null,
  synced: false,
  localSynced: false,
  connectionState: 'idle',
  retry: noop,
});

export function WorkspaceYDocProvider({ children }: PropsWithChildren) {
  const authSession = useAuthSession();
  const { refreshSession } = authSession;
  const { shareId } = useShareRoute();
  const clientRef = useRef<WorkspaceYDocSyncClient | null>(null);
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  const [timedOutAttempt, setTimedOutAttempt] = useState<number | null>(null);
  const [retry] = useState(() => () => clientRef.current?.retry());
  const [value, setValue] = useState<WorkspaceYDocContextValue>({
    doc: null,
    synced: false,
    localSynced: false,
    connectionState: 'idle',
    retry,
  });

  // 只有"是否登出"和身份本身该触发重建。refreshSession 期间 status 会短暂退回 loading，
  // 把它纳入依赖会拆掉一个健康的 Y.Doc，连带把整个界面退回启动态。
  const signedOut = authSession.status === 'signed_out';
  const authUserId = authSession.userId;
  const authWorkspaceId = authSession.workspaceId;

  useEffect(() => {
    const startupPlan = resolveWorkspaceYDocStartupPlan({
      authStatus: signedOut ? 'signed_out' : 'signed_in',
      userId: authUserId,
      workspaceId: authWorkspaceId,
      legacyMigrationCompleted: hasCompletedLegacyMigration(authUserId, authWorkspaceId),
    });

    if (!startupPlan.enabled) {
      // oxlint-disable-next-line react/set-state-in-effect
      setValue({
        doc: null,
        synced: false,
        localSynced: false,
        connectionState: 'idle',
        retry,
      });
      return;
    }

    let cancelled = false;
    const workspaceId = startupPlan.scope.workspaceId;
    const scope: WorkspaceScope = startupPlan.scope;
    const doc = new Y.Doc();
    ensureWorkspaceYDocMeta(doc);
    const persistence = new IndexeddbPersistence(buildWorkspaceYDocName(workspaceId), doc);
    let client: WorkspaceYDocSyncClient | null = null;
    let disposal: Promise<void> | null = null;
    const dispose = () => {
      if (disposal) return disposal;
      cancelled = true;
      clientRef.current = null;
      client?.destroy();
      doc.destroy();
      disposal = persistence.destroy().finally(unregister);
      return disposal;
    };
    const unregister = registerWorkspaceYDocDisposer(workspaceId, dispose);

    // oxlint-disable-next-line react/set-state-in-effect
    setValue({
      doc,
      synced: false,
      localSynced: false,
      connectionState: 'idle',
      retry,
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
        if (!committed && startupPlan.steps.includes('merge-legacy-indexeddb-snapshot')) {
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

      if (cancelled) return;
      setValue((prev) => ({ ...prev, doc, localSynced: true }));
      if (startupPlan.steps.includes('connect-durable-object')) {
        client = new WorkspaceYDocSyncClient(workspaceId, doc, (connectionStatus) => {
          if (cancelled) return;
          setValue((prev) => ({
            ...prev,
            connectionState: connectionStatus.state,
            failureReason: connectionStatus.failureReason,
            synced: connectionStatus.synced,
          }));
        });
        clientRef.current = client;
        void client.connect();
      }
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
  }, [signedOut, authUserId, authWorkspaceId, retry, bootstrapAttempt]);

  const memoizedValue = useMemo(() => value, [value]);
  // 分享页读的是分享快照而非 Y.Doc，工作区写入入口全部关闭，挡住它只会让本可展示的页面白屏。
  const blocked =
    !shareId &&
    isWorkspaceWriteTargetPending({
      authStatus: authSession.status,
      userId: authSession.userId,
      localSynced: value.localSynced,
    });

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
