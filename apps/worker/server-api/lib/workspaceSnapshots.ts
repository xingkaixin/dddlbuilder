import type { WorkspaceSnapshot } from '@ddlbuilder/shared-types/workspace';
import type { ApiEnv } from './context.js';
import {
  getWorkspaceSnapshotFromEntities,
  putWorkspaceSnapshotAsEntities,
} from './workspaceEntities.js';

export const getWorkspaceSnapshot = async (
  env: ApiEnv['Bindings'],
  userId: string,
): Promise<WorkspaceSnapshot> => getWorkspaceSnapshotFromEntities(env, userId);

export const putWorkspaceSnapshot = async (
  env: ApiEnv['Bindings'],
  userId: string,
  snapshot: WorkspaceSnapshot,
) => putWorkspaceSnapshotAsEntities(env, userId, snapshot);
