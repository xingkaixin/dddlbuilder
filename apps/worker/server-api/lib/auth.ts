import type { Context } from 'hono';
import { grantSignupCredits } from './credits.js';
import type { ApiEnv } from './context.js';
import { createBetterAuth } from './betterAuth.js';
import { DomainError } from './http.js';
import { getUserSystemConfig } from './userSystemConfig.js';

export type AuthenticatedAppUser = {
  userId: string;
  sessionId: string;
  email: string;
  emailVerified: boolean;
  name: string;
};

type BetterAuthSession = {
  session: {
    id: string;
    token: string;
  };
  user: {
    id: string;
    email: string;
    emailVerified: boolean;
    name: string;
  };
};

const ensureBusinessUser = async (
  env: ApiEnv['Bindings'],
  { user, session }: BetterAuthSession,
): Promise<AuthenticatedAppUser> => {
  await grantSignupCredits(env, { userId: user.id, email: user.email });

  return {
    userId: user.id,
    sessionId: session.id,
    email: user.email,
    emailVerified: user.emailVerified,
    name: user.name,
  };
};

export const resolveAuthenticatedUser = async (
  env: ApiEnv['Bindings'],
  headers: Headers,
): Promise<AuthenticatedAppUser | null> => {
  const auth = createBetterAuth(env);
  const config = getUserSystemConfig(env);
  const requestHeaders = new Headers();
  const cookieHeader = headers.get('cookie');

  if (cookieHeader) {
    requestHeaders.set('cookie', cookieHeader);
  }

  const response = await auth.handler(
    new Request(
      `${new URL(config.betterAuthUrl).origin}/api/auth/get-session?disableRefresh=true`,
      {
        method: 'GET',
        headers: requestHeaders,
      },
    ),
  );

  if (!response.ok) {
    throw new DomainError(503, 'SERVICE_UNAVAILABLE', 'FAILED_TO_GET_SESSION');
  }

  const session = (await response.json().catch(() => null)) as BetterAuthSession | null;

  if (!session?.user || !session.session?.id) {
    return null;
  }

  const flags = await env.USER_DB.prepare('SELECT user_id FROM admin_user_flags WHERE user_id = ?')
    .bind(session.user.id)
    .first();

  if (flags) {
    throw new DomainError(403, 'USER_DISABLED', 'USER_DISABLED');
  }

  return ensureBusinessUser(env, session);
};

export const authenticateRequest = async (c: Context<ApiEnv>) => {
  const user = await resolveAuthenticatedUser(c.env, c.req.raw.headers);
  if (!user) {
    throw new DomainError(401, 'AUTH_REQUIRED', 'AUTH_REQUIRED');
  }

  c.set('currentUserId', user.userId);
  return user;
};
