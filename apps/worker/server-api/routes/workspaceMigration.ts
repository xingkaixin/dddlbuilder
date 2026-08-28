import type { Hono } from 'hono';
import { decodeWorkspaceMigrationPayload } from '@ddlbuilder/workspace-core';
import type { ApiEnv } from '../lib/context.js';
import { authenticateRequest } from '../lib/auth.js';
import { errorResponse, parseJsonBodyWithLimit, withMeta } from '../lib/http.js';
import { analyzeWorkspaceMigration, commitWorkspaceMigration } from '../lib/workspaceMigration.js';

const REQUEST_BODY_MAX_BYTES = 5 * 1024 * 1024;

export function registerWorkspaceMigrationRoutes(app: Hono<ApiEnv>) {
  app.post('/workspace/migrations', async (c) => {
    const user = await authenticateRequest(c);

    const parsedBody = await parseJsonBodyWithLimit<{ mode?: unknown; payload?: unknown }>(
      c,
      REQUEST_BODY_MAX_BYTES,
    );
    if (!parsedBody.ok) return parsedBody.response;
    const body = parsedBody.data ?? {};

    const mode = body.mode === 'commit' ? 'commit' : body.mode === 'analyze' ? 'analyze' : null;
    if (!mode) {
      return errorResponse(c, 400, 'Invalid migration mode', 'INVALID_JSON');
    }

    const payload = decodeWorkspaceMigrationPayload(body.payload);
    if (!payload) {
      return errorResponse(c, 400, 'Invalid migration payload', 'INVALID_JSON');
    }

    const result =
      mode === 'analyze'
        ? await analyzeWorkspaceMigration(c.env, user.userId, payload)
        : await commitWorkspaceMigration(c.env, user.userId, payload);
    return c.json(withMeta(c, result));
  });
}
