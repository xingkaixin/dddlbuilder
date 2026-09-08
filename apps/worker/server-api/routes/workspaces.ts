import * as Schema from 'effect/Schema';
import { CurrentWorkspaceResponseSchema } from '@ddlbuilder/shared-types/api-contracts';
import type { Hono } from 'hono';
import type { ApiEnv } from '../lib/context.js';
import { authenticateRequest } from '../lib/auth.js';
import { withMeta } from '../lib/http.js';
import { getCurrentWorkspace } from '../lib/workspaceEntities.js';

export function registerWorkspaceRoutes(app: Hono<ApiEnv>) {
  app.get('/workspaces', async (c) => {
    const user = await authenticateRequest(c);

    return c.json(
      Schema.decodeUnknownSync(CurrentWorkspaceResponseSchema)(
        withMeta(c, await getCurrentWorkspace(c.env, user.userId)),
      ),
    );
  });
}
