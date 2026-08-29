import type { Context } from 'hono';
import type { ApiEnv } from './context.js';
import { createBetterAuth } from './betterAuth.js';
import { DomainError } from './http.js';
import { getRequestLogger } from './logging.js';

export type AuthenticatedAppUser = {
  userId: string;
  sessionId: string;
  email: string;
  emailVerified: boolean;
  name: string;
};

export const readSessionAccess = async (
  env: ApiEnv['Bindings'],
  userId: string,
  workspaceId: string | null = null,
) => {
  const { results } = await env.USER_DB.prepare(`
    SELECT s.id, f.user_id AS disabled
    FROM user u
    LEFT JOIN session s ON s.user_id = u.id AND s.expires_at > ?
    LEFT JOIN admin_user_flags f ON f.user_id = u.id
    WHERE u.id = ? AND (? IS NULL OR EXISTS (
      SELECT 1 FROM workspaces w WHERE w.id = ? AND w.user_id = u.id
    ))
  `)
    .bind(Date.now(), userId, workspaceId, workspaceId)
    .all<{ id: string | null; disabled: string | null }>();
  const disabled = results.some((row) => row.disabled != null);
  return {
    disabled,
    sessionIds: new Set(disabled ? [] : results.flatMap((row) => (row.id ? [row.id] : []))),
  };
};

export const revokeUserSessions = async (env: ApiEnv['Bindings'], userId: string) => {
  const context = await createBetterAuth(env).$context;
  await context.internalAdapter.deleteUserSessions(userId);
};

const throwAuthenticationUnavailable = (c: Context<ApiEnv>, error: unknown): never => {
  getRequestLogger(c)?.error(error instanceof Error ? error : String(error));
  throw new DomainError(503, 'SERVICE_UNAVAILABLE', 'Authentication service unavailable');
};

export const resolveAuthenticatedUser = async (
  c: Context<ApiEnv>,
): Promise<AuthenticatedAppUser | null> => {
  const auth = createBetterAuth(c.env);
  const requestHeaders = new Headers();
  const cookieHeader = c.req.raw.headers.get('cookie');

  if (cookieHeader) {
    requestHeaders.set('cookie', cookieHeader);
  }

  const session = await auth.api
    .getSession({ headers: requestHeaders, query: { disableRefresh: true } })
    .catch((error: unknown) => throwAuthenticationUnavailable(c, error));

  if (!session?.user || !session.session?.id) {
    return null;
  }

  const access = await readSessionAccess(c.env, session.user.id).catch((error: unknown) =>
    throwAuthenticationUnavailable(c, error),
  );
  if (access.disabled) throw new DomainError(403, 'USER_DISABLED', 'USER_DISABLED');
  if (!access.sessionIds.has(session.session.id)) return null;

  return {
    userId: session.user.id,
    sessionId: session.session.id,
    email: session.user.email,
    emailVerified: session.user.emailVerified,
    name: session.user.name,
  };
};

export const authenticateRequest = async (c: Context<ApiEnv>) => {
  const user = await resolveAuthenticatedUser(c);
  if (!user) {
    throw new DomainError(401, 'AUTH_REQUIRED', 'AUTH_REQUIRED');
  }

  c.set('currentUserId', user.userId);
  return user;
};
