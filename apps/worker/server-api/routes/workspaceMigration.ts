import type { Hono } from 'hono';
import type { ApiEnv } from '../lib/context.js';
import { authenticateRequest } from '../lib/auth.js';
import { errorResponse, parseJsonBodyWithLimit, withMeta } from '../lib/http.js';
import {
  analyzeWorkspaceMigration,
  commitWorkspaceMigration,
  type WorkspaceMigrationPayload,
} from '../lib/workspaceMigration.js';

const REQUEST_BODY_MAX_BYTES = 5 * 1024 * 1024;

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
    const user = await authenticateRequest(c);

    const parsedBody = await parseJsonBodyWithLimit<{ mode?: unknown; payload?: unknown }>(
      c,
      REQUEST_BODY_MAX_BYTES,
    );
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const body = parsedBody.data ?? {};

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
