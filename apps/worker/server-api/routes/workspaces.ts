import type { Context, Hono } from 'hono';
import {
  WORKSPACE_CHANGE_BATCH_LIMIT,
  WORKSPACE_CHANGE_ID_MAX_LENGTH,
  WORKSPACE_CONTENT_HASH_MAX_LENGTH,
  type WorkspaceChangesPushRequest,
} from '@ddlbuilder/shared-types/workspace';
import type { ApiEnv } from '../lib/context.js';
import { authenticateRequest } from '../lib/auth.js';
import { errorResponse, parseJsonBodyWithLimit, withMeta } from '../lib/http.js';
import {
  getWorkspaceChanges,
  isWorkspaceEntityOperation,
  isWorkspaceEntityType,
  listWorkspaces,
  pushWorkspaceChanges,
  WorkspaceNotFoundError,
} from '../lib/workspaceEntities.js';

const REQUEST_BODY_MAX_BYTES = 2 * 1024 * 1024;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isWorkspaceChangesPushRequest = (value: unknown): value is WorkspaceChangesPushRequest => {
  if (
    !isRecord(value) ||
    !Array.isArray(value.changes) ||
    value.changes.length === 0 ||
    value.changes.length > WORKSPACE_CHANGE_BATCH_LIMIT
  ) {
    return false;
  }

  return value.changes.every((item) => {
    if (!isRecord(item)) {
      return false;
    }

    return (
      typeof item.clientMutationId === 'string' &&
      item.clientMutationId.trim().length > 0 &&
      item.clientMutationId.length <= WORKSPACE_CHANGE_ID_MAX_LENGTH &&
      isWorkspaceEntityType(item.entityType) &&
      typeof item.entityId === 'string' &&
      item.entityId.trim().length > 0 &&
      item.entityId.length <= WORKSPACE_CHANGE_ID_MAX_LENGTH &&
      isWorkspaceEntityOperation(item.op) &&
      (item.baseVersion === null ||
        (typeof item.baseVersion === 'number' &&
          Number.isSafeInteger(item.baseVersion) &&
          item.baseVersion >= 0)) &&
      (item.contentHash === null ||
        (typeof item.contentHash === 'string' &&
          item.contentHash.length <= WORKSPACE_CONTENT_HASH_MAX_LENGTH)) &&
      Object.hasOwn(item, 'payload')
    );
  });
};

const readUser = async (c: Context<ApiEnv>) => {
  try {
    return await authenticateRequest(c);
  } catch (error) {
    if (error instanceof Error && error.message === 'AUTH_REQUIRED') {
      return null;
    }
    throw error;
  }
};

const parseSince = (value: string | undefined) => {
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
};

export function registerWorkspaceRoutes(app: Hono<ApiEnv>) {
  app.get('/workspaces', async (c) => {
    let user;
    try {
      user = await readUser(c);
    } catch (error) {
      console.error('[workspaces] auth failed', error);
      return errorResponse(c, 503, 'Authentication service unavailable', 'SERVICE_UNAVAILABLE');
    }

    if (!user) {
      return errorResponse(c, 401, 'Authentication required', 'AUTH_REQUIRED');
    }

    try {
      return c.json(withMeta(c, await listWorkspaces(c.env, user.userId)));
    } catch (error) {
      console.error('[workspaces] list failed', error);
      return errorResponse(c, 503, 'Workspace unavailable', 'SERVICE_UNAVAILABLE');
    }
  });

  app.get('/workspaces/:workspaceId/changes', async (c) => {
    let user;
    try {
      user = await readUser(c);
    } catch (error) {
      console.error('[workspaces] auth failed', error);
      return errorResponse(c, 503, 'Authentication service unavailable', 'SERVICE_UNAVAILABLE');
    }

    if (!user) {
      return errorResponse(c, 401, 'Authentication required', 'AUTH_REQUIRED');
    }

    const since = parseSince(c.req.query('since'));
    if (since == null) {
      return errorResponse(c, 400, 'Invalid workspace cursor', 'INVALID_JSON');
    }

    try {
      return c.json(
        withMeta(
          c,
          await getWorkspaceChanges(c.env, user.userId, c.req.param('workspaceId'), since),
        ),
      );
    } catch (error) {
      if (error instanceof WorkspaceNotFoundError) {
        return errorResponse(c, 404, 'Workspace not found', 'WORKSPACE_NOT_FOUND');
      }
      console.error('[workspaces] changes pull failed', error);
      return errorResponse(c, 503, 'Workspace changes unavailable', 'SERVICE_UNAVAILABLE');
    }
  });

  app.post('/workspaces/:workspaceId/changes', async (c) => {
    let user;
    try {
      user = await readUser(c);
    } catch (error) {
      console.error('[workspaces] auth failed', error);
      return errorResponse(c, 503, 'Authentication service unavailable', 'SERVICE_UNAVAILABLE');
    }

    if (!user) {
      return errorResponse(c, 401, 'Authentication required', 'AUTH_REQUIRED');
    }

    const parsedBody = await parseJsonBodyWithLimit<unknown>(c, REQUEST_BODY_MAX_BYTES);
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const body = parsedBody.data;

    if (!isWorkspaceChangesPushRequest(body)) {
      return errorResponse(c, 400, 'Invalid workspace changes payload', 'INVALID_JSON');
    }

    try {
      return c.json(
        withMeta(
          c,
          await pushWorkspaceChanges(c.env, user.userId, c.req.param('workspaceId'), body),
        ),
      );
    } catch (error) {
      if (error instanceof WorkspaceNotFoundError) {
        return errorResponse(c, 404, 'Workspace not found', 'WORKSPACE_NOT_FOUND');
      }
      console.error('[workspaces] changes push failed', error);
      return errorResponse(c, 503, 'Workspace changes unavailable', 'SERVICE_UNAVAILABLE');
    }
  });
}
