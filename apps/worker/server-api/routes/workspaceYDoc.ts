import type { Hono } from 'hono';
import type { ApiEnv } from '../lib/context.js';
import { authenticateRequest } from '../lib/auth.js';
import { errorResponse } from '../lib/http.js';
import { assertWorkspaceOwner, WorkspaceNotFoundError } from '../lib/workspaceEntities.js';

export function registerWorkspaceYDocRoutes(app: Hono<ApiEnv>) {
  app.get('/workspaces/:workspaceId/yjs', async (c) => {
    const user = await authenticateRequest(c);
    const workspaceId = c.req.param('workspaceId');

    if (!workspaceId) {
      return errorResponse(c, 400, 'Invalid workspace id', 'INVALID_JSON');
    }

    try {
      await assertWorkspaceOwner(c.env, user.userId, workspaceId);
    } catch (error) {
      if (error instanceof WorkspaceNotFoundError) {
        return errorResponse(c, 403, 'Workspace access denied', 'WORKSPACE_ACCESS_DENIED');
      }

      throw error;
    }

    const namespace = c.env.WORKSPACE_YDOC;

    if (!namespace) {
      return errorResponse(c, 503, 'Workspace sync unavailable', 'SERVICE_UNAVAILABLE');
    }

    if (c.req.raw.method === 'HEAD') {
      return new Response(null, { status: 204 });
    }

    const headers = new Headers(c.req.raw.headers);
    headers.set('x-ddlbuilder-workspace-id', workspaceId);
    headers.set('x-ddlbuilder-user-id', user.userId);
    headers.set('x-ddlbuilder-session-id', user.sessionId);

    return namespace
      .get(namespace.idFromName(workspaceId))
      .fetch(new Request(c.req.raw.url, { method: c.req.raw.method, headers }));
  });
}
