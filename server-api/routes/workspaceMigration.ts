import type { Hono } from 'hono';
import type { ApiEnv } from '../lib/context.js';
import { authenticateAccessToken, isInvalidJwtError, readBearerToken } from '../lib/auth.js';
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
    const token = readBearerToken(c);
    if (!token) {
      return errorResponse(c, 401, 'Authentication required', 'AUTH_REQUIRED');
    }

    let user;
    try {
      user = await authenticateAccessToken(c.env, token);
    } catch (error) {
      if (isInvalidJwtError(error)) {
        return errorResponse(c, 401, 'Invalid or expired access token', 'INVALID_AUTH_TOKEN');
      }
      if (error instanceof Error && error.message === 'USER_DISABLED') {
        return errorResponse(c, 403, 'User account is disabled', 'USER_DISABLED');
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
          ? await analyzeWorkspaceMigration(c.env, user.appUserId, payload)
          : await commitWorkspaceMigration(c.env, user.appUserId, payload);

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
