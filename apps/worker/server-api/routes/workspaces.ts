import type { Hono } from 'hono';
import type { ApiEnv } from '../lib/context.js';
import { authenticateRequest } from '../lib/auth.js';
import { errorResponse, withMeta } from '../lib/http.js';
import { getCurrentWorkspace } from '../lib/workspaceEntities.js';

export function registerWorkspaceRoutes(app: Hono<ApiEnv>) {
  app.get('/workspaces', async (c) => {
    const user = await authenticateRequest(c);

    try {
      return c.json(withMeta(c, await getCurrentWorkspace(c.env, user.userId)));
    } catch (error) {
      console.error('[workspaces] current workspace lookup failed', error);
      return errorResponse(c, 503, 'Workspace unavailable', 'SERVICE_UNAVAILABLE');
    }
  });
}
