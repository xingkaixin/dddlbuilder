import * as Y from 'yjs';
import type { WorkspaceSnapshot } from '@ddlbuilder/shared-types/workspace';
import { exportWorkspaceYDocToSnapshot } from '@ddlbuilder/workspace-core';
import type { ApiEnv } from './context.js';
import { getOrCreateDefaultWorkspace } from './workspaceEntities.js';

export type WorkspaceYDocAuthority = {
  readSnapshot: () => Promise<WorkspaceSnapshot>;
  mergeSnapshot: (snapshot: WorkspaceSnapshot) => Promise<void>;
};

const buildRequest = (
  workspaceId: string,
  userId: string,
  operation: 'state' | 'merge',
  snapshot?: WorkspaceSnapshot,
) =>
  new Request(`https://workspace.internal/workspaces/${workspaceId}/yjs/${operation}`, {
    method: operation === 'state' ? 'GET' : 'POST',
    headers: {
      'content-type': 'application/json',
      'x-ddlbuilder-workspace-id': workspaceId,
      'x-ddlbuilder-user-id': userId,
    },
    ...(snapshot ? { body: JSON.stringify(snapshot) } : {}),
  });

const assertSuccessfulResponse = async (response: Response, operation: string) => {
  if (response.ok) return;
  const detail = await response.text();
  throw new Error(`Workspace Y.Doc ${operation} failed (${response.status}): ${detail}`);
};

export const openDefaultWorkspaceYDocAuthority = async (
  env: ApiEnv['Bindings'],
  userId: string,
): Promise<WorkspaceYDocAuthority> => {
  const namespace = env.WORKSPACE_YDOC;
  if (!namespace) {
    throw new Error('Workspace Y.Doc authority is unavailable');
  }

  const workspace = await getOrCreateDefaultWorkspace(env, userId);
  const stub = namespace.get(namespace.idFromName(workspace.id));

  return {
    readSnapshot: async () => {
      const response = await stub.fetch(buildRequest(workspace.id, userId, 'state'));
      await assertSuccessfulResponse(response, 'read');
      const doc = new Y.Doc();
      Y.applyUpdate(doc, new Uint8Array(await response.arrayBuffer()));
      return exportWorkspaceYDocToSnapshot(doc);
    },
    mergeSnapshot: async (snapshot) => {
      const response = await stub.fetch(buildRequest(workspace.id, userId, 'merge', snapshot));
      await assertSuccessfulResponse(response, 'merge');
    },
  };
};
