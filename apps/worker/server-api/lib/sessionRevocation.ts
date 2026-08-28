import type { ApiEnv } from './context.js';

export const kickWorkspaceSockets = async (
  env: ApiEnv['Bindings'],
  { userId, sessionId }: { userId: string; sessionId?: string },
) => {
  const namespace = env.WORKSPACE_YDOC;
  if (!namespace) return;
  const workspaces = await env.USER_DB.prepare('SELECT id FROM workspaces WHERE user_id = ?')
    .bind(userId)
    .all<{ id: string }>();
  await Promise.all(
    (workspaces.results ?? []).map(async ({ id }) => {
      try {
        const response = await namespace
          .get(namespace.idFromName(id))
          .fetch('https://workspace-ydoc.internal/kick', {
            method: 'POST',
            headers: {
              'x-ddlbuilder-user-id': userId,
              ...(sessionId ? { 'x-ddlbuilder-session-id': sessionId } : {}),
            },
          });
        if (!response.ok) throw new Error(`Workspace revocation failed: ${response.status}`);
      } catch (error) {
        console.error('[auth] workspace socket revocation failed', { workspaceId: id, error });
      }
    }),
  );
};
