import type { Context } from 'hono';
import { applyCreditMutation, ensureCreditAccount } from './credits.js';
import type { ApiEnv } from './context.js';
import { createBetterAuth } from './betterAuth.js';
import { getUserSystemConfig } from './userSystemConfig.js';

export type AuthenticatedAppUser = {
  userId: string;
  email: string;
  emailVerified: boolean;
  name: string;
};

type BetterAuthSession = {
  session: {
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
  user: BetterAuthSession['user'],
): Promise<AuthenticatedAppUser> => {
  const config = getUserSystemConfig(env);
  await ensureCreditAccount(env, user.id);
  await applyCreditMutation(env, {
    userId: user.id,
    kind: 'grant',
    source: 'signup_bonus',
    amount: config.signupBonusCredits,
    idempotencyKey: `signup_bonus:${user.id}`,
    ledgerId: `signup_bonus:${user.id}`,
    metadata: {
      email: user.email,
    },
  });

  return {
    userId: user.id,
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
    throw new Error('FAILED_TO_GET_SESSION');
  }

  const session = (await response.json().catch(() => null)) as BetterAuthSession | null;

  if (!session?.user) {
    return null;
  }

  const flags = await env.USER_DB.prepare('SELECT user_id FROM admin_user_flags WHERE user_id = ?')
    .bind(session.user.id)
    .first();

  if (flags) {
    throw new Error('USER_DISABLED');
  }

  return ensureBusinessUser(env, session.user);
};

export const authenticateRequest = async (c: Context<ApiEnv>) => {
  const user = await resolveAuthenticatedUser(c.env, c.req.raw.headers);
  if (!user) {
    throw new Error('AUTH_REQUIRED');
  }

  c.set('currentUserId', user.userId);
  return user;
};
