import {
  createContext,
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
import { buildWorkspaceYDocName } from '@/services/workspaceYDocStorage';
import { resolveWorkspaceYDocStartupPlan } from '@/services/workspaceYDocAuthority';

type WorkspaceYDocContextValue = {
  doc: Y.Doc | null;
  synced: boolean;
  localSynced: boolean;
  connectionState: WorkspaceYDocConnectionState;
  failureReason?: WorkspaceYDocFailureReason;
  retry: () => void;
};

const noop = () => {};

const WorkspaceYDocContext = createContext<WorkspaceYDocContextValue>({
  doc: null,
  synced: false,
  localSynced: false,
  connectionState: 'idle',
  retry: noop,
});

export function WorkspaceYDocProvider({ children }: PropsWithChildren) {
  const authSession = useAuthSession();
  const clientRef = useRef<WorkspaceYDocSyncClient | null>(null);
  const retry = useMemo(() => () => clientRef.current?.retry(), []);
  const [value, setValue] = useState<WorkspaceYDocContextValue>({
    doc: null,
    synced: false,
    localSynced: false,
    connectionState: 'idle',
    retry,
  });

  useEffect(() => {
    const startupPlan = resolveWorkspaceYDocStartupPlan({
      authStatus: authSession.status,
      userId: authSession.userId,
      workspaceId: authSession.workspaceId,
    });

    if (!startupPlan.enabled) {
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

      if (startupPlan.steps.includes('merge-legacy-indexeddb-snapshot')) {
        // legacy 合并是尽力而为的补充步骤，失败不能阻断后续启动：localSynced 卡在 false 会让
        // usePersistedState 永不水合，用户之后的编辑被静默丢弃。
        // 已知限制：中途失败（例如提升到第 4 张表时 IndexedDB 报错）会让目标分区变成“有内容”，
        // promoteLegacyUserWorkspaceData 的守卫下次启动即判定“已提升过”，剩余 legacy 数据不再提升。
        // legacy 分区全程只读、数据仍在，根治需要显式的“提升完成标记”，留待后续。
        try {
          const snapshot = await prepareLegacyWorkspaceSnapshot(scope);
          if (snapshot && !cancelled) {
            mergeWorkspaceSnapshotIntoYDoc(doc, snapshot);
          }
        } catch (error) {
          console.error('[workspace-yjs] legacy snapshot merge failed', error);
        }
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
      cancelled = true;
      clientRef.current = null;
      client?.destroy();
      void persistence.destroy();
      doc.destroy();
    };
  }, [authSession.status, authSession.userId, authSession.workspaceId, retry]);

  const memoizedValue = useMemo(() => value, [value]);

  return (
    <WorkspaceYDocContext.Provider value={memoizedValue}>{children}</WorkspaceYDocContext.Provider>
  );
}

export const useWorkspaceYDoc = () => useContext(WorkspaceYDocContext);
