import type { WorkspaceScope } from '@ddlbuilder/shared-types/workspace';

export const WORKSPACE_SYNC_AUTHORITY_MATRIX = [
  {
    store: 'IndexedDB',
    responsibility: 'browser-local cache and offline startup copy',
  },
  {
    store: 'Y.Doc',
    responsibility: 'workspace content CRDT and client runtime source',
  },
  {
    store: 'Durable Object storage',
    responsibility: 'server-side realtime Yjs update log and compacted snapshot',
  },
  {
    store: 'D1 workspace_entities',
    responsibility: 'legacy HTTP recovery projection until Yjs checkpoints own the projection',
  },
] as const;

export type WorkspaceYDocStartupStep =
  | 'load-indexeddb-ydoc'
  | 'merge-legacy-indexeddb-snapshot'
  | 'connect-durable-object';

export type WorkspaceYDocStartupPlan =
  | {
      enabled: false;
      reason: 'signed-out' | 'missing-workspace';
    }
  | {
      enabled: true;
      scope: Extract<WorkspaceScope, { kind: 'user' }> & { workspaceId: string };
      steps: WorkspaceYDocStartupStep[];
      d1Persistence: 'durable-object-checkpoint';
      queueEntityOutbox: false;
    };

type UserWorkspaceScope = Extract<WorkspaceScope, { kind: 'user' }> & { workspaceId: string };

export const resolveWorkspaceYDocStartupPlan = (input: {
  authStatus: 'loading' | 'signed_in' | 'signed_out';
  userId?: string | null;
  workspaceId?: string | null;
}): WorkspaceYDocStartupPlan => {
  if (input.authStatus !== 'signed_in') {
    return { enabled: false, reason: 'signed-out' };
  }

  if (!input.userId || !input.workspaceId) {
    return { enabled: false, reason: 'missing-workspace' };
  }

  return {
    enabled: true,
    scope: {
      kind: 'user',
      userId: input.userId,
      workspaceId: input.workspaceId,
    },
    steps: ['load-indexeddb-ydoc', 'merge-legacy-indexeddb-snapshot', 'connect-durable-object'],
    d1Persistence: 'durable-object-checkpoint',
    queueEntityOutbox: false,
  };
};

export const shouldQueueWorkspaceEntityOutbox = (input: {
  scope: WorkspaceScope | null | undefined;
  yDocReady: boolean;
}): input is { scope: UserWorkspaceScope; yDocReady: false } =>
  input.scope?.kind === 'user' && Boolean(input.scope.workspaceId) && input.yDocReady === false;
