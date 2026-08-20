/**
 * Workspace sync authority: Y.Doc is the client runtime source of truth for workspace content,
 * IndexedDB is its browser-local cache and offline startup copy, Durable Object storage holds the
 * server-side Yjs update log plus compacted snapshot, and D1 `workspace_entities` remains a legacy
 * HTTP recovery projection until Yjs checkpoints own that projection.
 */
import type { WorkspaceScope } from '@ddlbuilder/shared-types/workspace';

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
