import type { Hono } from 'hono';
import type { ApiEnv } from '../lib/context.js';
import { authenticateRequest } from '../lib/auth.js';
import { errorResponse, withMeta } from '../lib/http.js';
import { listWorkspaces } from '../lib/workspaceEntities.js';

export function registerWorkspaceRoutes(app: Hono<ApiEnv>) {
  app.get('/workspaces', async (c) => {
    let user;
    try {
      user = await authenticateRequest(c);
    } catch (error) {
      if (error instanceof Error && error.message === 'AUTH_REQUIRED') {
        return errorResponse(c, 401, 'Authentication required', 'AUTH_REQUIRED');
      }
      console.error('[workspaces] auth failed', error);
      return errorResponse(c, 503, 'Authentication service unavailable', 'SERVICE_UNAVAILABLE');
    }

    try {
      return c.json(withMeta(c, await listWorkspaces(c.env, user.userId)));
    } catch (error) {
      console.error('[workspaces] list failed', error);
      return errorResponse(c, 503, 'Workspace unavailable', 'SERVICE_UNAVAILABLE');
    }
  });
}
