import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import type { WorkspaceScope, WorkspaceSnapshot } from '@ddlbuilder/shared-types/workspace';
import { useAuthSession } from '@/auth/AuthSessionProvider';
import {
  collectWorkspaceMigrationPayload,
  type WorkspaceMigrationPayload,
} from '@/services/workspaceMigrationService';
import {
  ensureWorkspaceYDocMeta,
  importWorkspaceSnapshotToYDoc,
  isWorkspaceYDocEmpty,
} from '@/services/workspaceYDocAdapter';
import {
  WorkspaceYDocSyncClient,
  type WorkspaceYDocConnectionState,
} from '@/services/workspaceYDocSyncClient';
import { buildWorkspaceYDocName } from '@/services/workspaceYDocStorage';

type WorkspaceYDocContextValue = {
  doc: Y.Doc | null;
  synced: boolean;
  localSynced: boolean;
  connectionState: WorkspaceYDocConnectionState;
};

const WorkspaceYDocContext = createContext<WorkspaceYDocContextValue>({
  doc: null,
  synced: false,
  localSynced: false,
  connectionState: 'idle',
});

const migrationSnapshotToWorkspaceSnapshot = (
  payloadSnapshot: WorkspaceMigrationPayload['snapshot'],
): WorkspaceSnapshot => {
  const drafts = [...payloadSnapshot.drafts];
  const activeSession = payloadSnapshot.activeSession;
  const activeSource = activeSession?.activeSource;
  if (activeSession?.activeState && activeSource?.kind === 'draft') {
    const existingIndex = drafts.findIndex((draft) => draft.draftId === activeSource.draftId);
    const draft = {
      draftId: activeSource.draftId,
      state: activeSession.activeState,
      updatedAt: activeSession.updatedAt,
    };
    if (existingIndex >= 0) {
      drafts[existingIndex] = { ...drafts[existingIndex], ...draft };
    } else {
      drafts.push(draft);
    }
  }

  return {
    globalDraft: payloadSnapshot.globalDraft,
    drafts,
    savedTables: payloadSnapshot.savedTables,
    savedDrafts: payloadSnapshot.savedDrafts,
    folders: payloadSnapshot.folders,
  };
};

export function WorkspaceYDocProvider({ children }: PropsWithChildren) {
  const authSession = useAuthSession();
  const [value, setValue] = useState<WorkspaceYDocContextValue>({
    doc: null,
    synced: false,
    localSynced: false,
    connectionState: 'idle',
  });

  useEffect(() => {
    if (authSession.status !== 'signed_in' || !authSession.userId || !authSession.workspaceId) {
      setValue({
        doc: null,
        synced: false,
        localSynced: false,
        connectionState: 'idle',
      });
      return;
    }

    let cancelled = false;
    const workspaceId = authSession.workspaceId;
    const scope: WorkspaceScope = {
      kind: 'user',
      userId: authSession.userId,
      workspaceId,
    };
    const doc = new Y.Doc();
    ensureWorkspaceYDocMeta(doc);
    const persistence = new IndexeddbPersistence(buildWorkspaceYDocName(workspaceId), doc);
    let client: WorkspaceYDocSyncClient | null = null;

    setValue({
      doc,
      synced: false,
      localSynced: false,
      connectionState: 'idle',
    });

    const initialize = async () => {
      await persistence.whenSynced;
      if (cancelled) return;

      if (isWorkspaceYDocEmpty(doc)) {
        const payload = await collectWorkspaceMigrationPayload(scope);
        if (payload && !cancelled) {
          importWorkspaceSnapshotToYDoc(
            doc,
            migrationSnapshotToWorkspaceSnapshot(payload.snapshot),
          );
        }
      }

      if (cancelled) return;
      setValue((prev) => ({ ...prev, doc, localSynced: true }));
      client = new WorkspaceYDocSyncClient(workspaceId, doc, (connectionState) => {
        if (cancelled) return;
        setValue((prev) => ({
          ...prev,
          connectionState,
          synced: connectionState === 'connected',
        }));
      });
      client.connect();
    };

    void initialize().catch((error) => {
      console.error('[workspace-yjs] initialize failed', error);
      if (!cancelled) {
        setValue((prev) => ({ ...prev, connectionState: 'error' }));
      }
    });

    return () => {
      cancelled = true;
      client?.destroy();
      void persistence.destroy();
      doc.destroy();
    };
  }, [authSession.status, authSession.userId, authSession.workspaceId]);

  const memoizedValue = useMemo(() => value, [value]);

  return (
    <WorkspaceYDocContext.Provider value={memoizedValue}>{children}</WorkspaceYDocContext.Provider>
  );
}

export const useWorkspaceYDoc = () => useContext(WorkspaceYDocContext);
