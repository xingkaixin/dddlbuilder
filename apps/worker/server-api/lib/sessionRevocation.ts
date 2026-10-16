import type { ApiEnv } from './context.js';

const KICK_MAX_ATTEMPTS = 3;
const KICK_RETRY_BASE_DELAY_MS = 50;

const wait = (delayMs: number) => new Promise((resolve) => setTimeout(resolve, delayMs));

const kickWorkspaceSocketsOnce = async (
  namespace: DurableObjectNamespace,
  workspaceId: string,
  { userId, sessionId }: { userId: string; sessionId?: string },
) => {
  const response = await namespace
    .get(namespace.idFromName(workspaceId))
    .fetch('https://workspace-ydoc.internal/kick', {
      method: 'POST',
      headers: {
        'x-ddlbuilder-user-id': userId,
        ...(sessionId ? { 'x-ddlbuilder-session-id': sessionId } : {}),
      },
    });

  if (!response.ok) throw new Error(`Workspace revocation failed: ${response.status}`);
};

const kickWorkspaceSocketsWithRetry = async (
  namespace: DurableObjectNamespace,
  workspaceId: string,
  identity: { userId: string; sessionId?: string },
) => {
  let lastError: unknown;

  for (let attempt = 1; attempt <= KICK_MAX_ATTEMPTS; attempt += 1) {
    try {
      await kickWorkspaceSocketsOnce(namespace, workspaceId, identity);

      return;
    } catch (error) {
      lastError = error;

      if (attempt < KICK_MAX_ATTEMPTS) {
        await wait(KICK_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
      }
    }
  }

  throw lastError;
};

const kickWorkspaceSockets = async (
  env: ApiEnv['Bindings'],
  { userId, sessionId }: { userId: string; sessionId?: string },
) => {
  const workspaces = await env.USER_DB.prepare('SELECT id FROM workspaces WHERE user_id = ?')
    .bind(userId)
    .all<{ id: string }>();

  const workspaceIds = (workspaces.results ?? []).map(({ id }) => id);

  if (workspaceIds.length === 0) return;

  const namespace = env.WORKSPACE_YDOC;

  if (!namespace) throw new Error('Workspace socket revocation is unavailable');

  const results = await Promise.allSettled(
    workspaceIds.map((workspaceId) =>
      kickWorkspaceSocketsWithRetry(namespace, workspaceId, { userId, sessionId }),
    ),
  );
  const failures = results.flatMap((result, index) =>
    result.status === 'rejected'
      ? [{ workspaceId: workspaceIds[index], error: result.reason }]
      : [],
  );

  if (failures.length === 0) return;

  for (const failure of failures) {
    console.error('[auth] workspace socket revocation failed', failure);
  }

  throw new AggregateError(
    failures.map(({ error }) => error),
    `Workspace socket revocation failed for ${failures.length} workspace(s)`,
  );
};

const stopAIConversations = async (
  env: ApiEnv['Bindings'],
  identity: { userId: string; sessionId?: string },
) => {
  if (!env.AI_CONVERSATIONS) return;

  const { results } =
    await env.USER_DB.prepare(`UPDATE ai_operations SET stopped_at = COALESCE(stopped_at, ?)
    WHERE user_id = ? AND (? IS NULL OR session_id = ?) AND completed_at IS NULL
    RETURNING id, conversation_id, submitted_at`)
      .bind(Date.now(), identity.userId, identity.sessionId ?? null, identity.sessionId ?? null)
      .all<{ id: string; conversation_id: string; submitted_at: number | null }>();
  const failures: unknown[] = [];

  for (const operation of results) {
    if (!operation.submitted_at) continue;

    try {
      const response = await env.AI_CONVERSATIONS.get(
        env.AI_CONVERSATIONS.idFromName(operation.conversation_id),
      ).fetch(`https://ai.internal/stop?operation=${encodeURIComponent(operation.id)}`, {
        method: 'POST',
        headers: { 'x-ai-user': identity.userId },
      });
      await response.body?.cancel();

      if (!response.ok && response.status !== 409) throw new Error('AI session revocation failed');
    } catch (error) {
      failures.push(error);
    }
  }

  if (failures.length) throw new AggregateError(failures, 'AI session revocation failed');
};

export const revokeSessionActivity = async (
  env: ApiEnv['Bindings'],
  identity: { userId: string; sessionId?: string },
) => {
  const results = await Promise.allSettled([
    kickWorkspaceSockets(env, identity),
    stopAIConversations(env, identity),
  ]);
  const errors = results.flatMap((result) => (result.status === 'rejected' ? [result.reason] : []));

  if (errors.length === 1) throw errors[0];

  if (errors.length) throw new AggregateError(errors, 'User activity revocation failed');
};
