import type { Context } from 'hono';
import type { ApiEnv } from './context.js';
import { createBetterAuth } from './betterAuth.js';
import { DomainError } from './http.js';

export type AuthenticatedAppUser = {
  userId: string;
  sessionId: string;
  email: string;
  emailVerified: boolean;
  name: string;
};

export const resolveAuthenticatedUser = async (
  env: ApiEnv['Bindings'],
  headers: Headers,
): Promise<AuthenticatedAppUser | null> => {
  const auth = createBetterAuth(env);
  const requestHeaders = new Headers();
  const cookieHeader = headers.get('cookie');

  if (cookieHeader) {
    requestHeaders.set('cookie', cookieHeader);
  }

  const session = await auth.api
    .getSession({ headers: requestHeaders, query: { disableRefresh: true } })
    .catch((error: unknown) => {
      console.error('[auth] session lookup failed', error);
      throw new DomainError(503, 'SERVICE_UNAVAILABLE', 'FAILED_TO_GET_SESSION');
    });

  if (!session?.user || !session.session?.id) {
    return null;
  }

  const flags = await env.USER_DB.prepare('SELECT user_id FROM admin_user_flags WHERE user_id = ?')
    .bind(session.user.id)
    .first();

  if (flags) {
    throw new DomainError(403, 'USER_DISABLED', 'USER_DISABLED');
  }

  return {
    userId: session.user.id,
    sessionId: session.session.id,
    email: session.user.email,
    emailVerified: session.user.emailVerified,
    name: session.user.name,
  };
};

export const authenticateRequest = async (c: Context<ApiEnv>) => {
  const user = await resolveAuthenticatedUser(c.env, c.req.raw.headers);
  if (!user) {
    throw new DomainError(401, 'AUTH_REQUIRED', 'AUTH_REQUIRED');
  }

  c.set('currentUserId', user.userId);
  return user;
};
