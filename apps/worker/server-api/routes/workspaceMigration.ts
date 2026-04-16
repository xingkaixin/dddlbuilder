import type { Hono } from 'hono';
import type { ApiEnv } from '../lib/context.js';
import { authenticateRequest } from '../lib/auth.js';
import { errorResponse, withMeta } from '../lib/http.js';
import {
  analyzeWorkspaceMigration,
  commitWorkspaceMigration,
  type WorkspaceMigrationPayload,
} from '../lib/workspaceMigration.js';

const isPersistedStateRecord = (value: unknown) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isWorkspaceMigrationPayload = (value: unknown): value is WorkspaceMigrationPayload => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.localFingerprint === 'string' &&
    record.localFingerprint.trim().length > 0 &&
    typeof record.idempotencyKey === 'string' &&
    record.idempotencyKey.trim().length > 0 &&
    typeof record.snapshot === 'object' &&
    record.snapshot !== null
  );
};

export function registerWorkspaceMigrationRoutes(app: Hono<ApiEnv>) {
  app.post('/workspace/migrations', async (c) => {
    let user;
    try {
      user = await authenticateRequest(c);
    } catch (error) {
      if (error instanceof Error && error.message === 'AUTH_REQUIRED') {
        return errorResponse(c, 401, 'Authentication required', 'AUTH_REQUIRED');
      }
      console.error('[workspace-migration] auth failed', error);
      return errorResponse(c, 503, 'Authentication service unavailable', 'SERVICE_UNAVAILABLE');
    }

    let body: { mode?: unknown; payload?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return errorResponse(c, 400, 'Invalid JSON body', 'INVALID_JSON');
    }

    const mode = body.mode === 'commit' ? 'commit' : body.mode === 'analyze' ? 'analyze' : null;
    if (!mode) {
      return errorResponse(c, 400, 'Invalid migration mode', 'INVALID_JSON');
    }

    if (!isWorkspaceMigrationPayload(body.payload)) {
      return errorResponse(c, 400, 'Invalid migration payload', 'INVALID_JSON');
    }

    const payload = body.payload;
    if (
      payload.snapshot.globalDraft &&
      !isPersistedStateRecord(payload.snapshot.globalDraft.state)
    ) {
      return errorResponse(c, 400, 'Invalid migration payload', 'INVALID_JSON');
    }

    try {
      const result =
        mode === 'analyze'
          ? await analyzeWorkspaceMigration(c.env, user.userId, payload)
          : await commitWorkspaceMigration(c.env, user.userId, payload);

      return c.json(
        withMeta(c, {
          ...result,
        }),
      );
    } catch (error) {
      console.error(`[workspace-migration] ${mode} failed`, error);
      return errorResponse(c, 503, 'Workspace migration unavailable', 'SERVICE_UNAVAILABLE');
    }
  });
}
