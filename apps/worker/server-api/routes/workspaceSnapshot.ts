import type { Hono } from 'hono';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { WorkspaceSnapshot } from '@ddlbuilder/shared-types/workspace';
import type { ApiEnv } from '../lib/context.js';
import { authenticateRequest } from '../lib/auth.js';
import { errorResponse, withMeta } from '../lib/http.js';
import { getWorkspaceSnapshot, putWorkspaceSnapshot } from '../lib/workspaceSnapshots.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isPersistedState = (value: unknown): value is PersistedState => isRecord(value);

const isWorkspaceSnapshot = (value: unknown): value is WorkspaceSnapshot => {
  if (!isRecord(value)) {
    return false;
  }

  const globalDraft =
    value.globalDraft === null ||
    (isRecord(value.globalDraft) &&
      typeof value.globalDraft.updatedAt === 'number' &&
      isPersistedState(value.globalDraft.state));
  const savedTables =
    Array.isArray(value.savedTables) &&
    value.savedTables.every(
      (item) =>
        isRecord(item) &&
        typeof item.normalizedName === 'string' &&
        typeof item.name === 'string' &&
        typeof item.updatedAt === 'number' &&
        isPersistedState(item.state),
    );
  const savedDrafts =
    Array.isArray(value.savedDrafts) &&
    value.savedDrafts.every(
      (item) =>
        isRecord(item) &&
        typeof item.normalizedName === 'string' &&
        typeof item.tableName === 'string' &&
        typeof item.baseSignature === 'string' &&
        typeof item.updatedAt === 'number' &&
        isPersistedState(item.state),
    );
  const folders =
    Array.isArray(value.folders) &&
    value.folders.every(
      (item) =>
        isRecord(item) &&
        typeof item.id === 'string' &&
        typeof item.name === 'string' &&
        typeof item.order === 'number' &&
        typeof item.createdAt === 'number' &&
        (item.parentId === undefined || typeof item.parentId === 'string'),
    );

  return globalDraft && savedTables && savedDrafts && folders;
};

export function registerWorkspaceSnapshotRoutes(app: Hono<ApiEnv>) {
  app.get('/workspace/snapshot', async (c) => {
    let user;
    try {
      user = await authenticateRequest(c);
    } catch (error) {
      if (error instanceof Error && error.message === 'AUTH_REQUIRED') {
        return errorResponse(c, 401, 'Authentication required', 'AUTH_REQUIRED');
      }
      console.error('[workspace-snapshot] auth failed', error);
      return errorResponse(c, 503, 'Authentication service unavailable', 'SERVICE_UNAVAILABLE');
    }

    try {
      const snapshot = await getWorkspaceSnapshot(c.env, user.userId);
      return c.json(withMeta(c, snapshot));
    } catch (error) {
      console.error('[workspace-snapshot] get failed', error);
      return errorResponse(c, 503, 'Workspace snapshot unavailable', 'SERVICE_UNAVAILABLE');
    }
  });

  app.put('/workspace/snapshot', async (c) => {
    let user;
    try {
      user = await authenticateRequest(c);
    } catch (error) {
      if (error instanceof Error && error.message === 'AUTH_REQUIRED') {
        return errorResponse(c, 401, 'Authentication required', 'AUTH_REQUIRED');
      }
      console.error('[workspace-snapshot] auth failed', error);
      return errorResponse(c, 503, 'Authentication service unavailable', 'SERVICE_UNAVAILABLE');
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return errorResponse(c, 400, 'Invalid JSON body', 'INVALID_JSON');
    }

    if (!isWorkspaceSnapshot(body)) {
      return errorResponse(c, 400, 'Invalid workspace snapshot payload', 'INVALID_JSON');
    }

    try {
      await putWorkspaceSnapshot(c.env, user.userId, body);
      return c.json(
        withMeta(c, {
          ok: true as const,
        }),
      );
    } catch (error) {
      console.error('[workspace-snapshot] put failed', error);
      return errorResponse(c, 503, 'Workspace snapshot unavailable', 'SERVICE_UNAVAILABLE');
    }
  });
}
