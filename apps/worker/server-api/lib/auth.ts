import type { Context } from 'hono';
import type { ApiEnv } from './context.js';
import { createBetterAuth } from './betterAuth.js';
import { DomainError } from './http.js';
import { getRequestLogger } from './logging.js';
import { revokeSessionActivity } from './sessionRevocation.js';

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

const readRequestSessionAccess = async (
  env: ApiEnv['Bindings'],
  userId: string,
  sessionId: string,
) => {
  const row = await env.USER_DB.prepare(`
    SELECT
      EXISTS (
        SELECT 1 FROM session WHERE id = ? AND user_id = ? AND expires_at > ?
      ) AS active,
      EXISTS (SELECT 1 FROM admin_user_flags WHERE user_id = ?) AS disabled
  `)
    .bind(sessionId, userId, Date.now(), userId)
    .first<{ active: number; disabled: number }>();

  return { active: row?.active === 1, disabled: row?.disabled === 1 };
};

export const revokeUserSessions = async (env: ApiEnv['Bindings'], userId: string) => {
  const context = await createBetterAuth(env).$context;
  let deleteError: unknown;

  try {
    await context.internalAdapter.deleteUserSessions(userId);
  } catch (error) {
    deleteError = error;
  }

  let kickError: unknown;

  try {
    await revokeSessionActivity(env, { userId });
  } catch (error) {
    kickError = error;
  }

  if (deleteError && kickError) {
    throw new AggregateError([deleteError, kickError], 'Failed to revoke user sessions');
  }

  if (deleteError) throw deleteError;

  if (kickError) throw kickError;
};

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- authentication SDK failures cross the adapter as unknown.
const throwAuthenticationUnavailable = (c: Context<ApiEnv>, error: unknown): never => {
  getRequestLogger(c)?.error(error instanceof Error ? error : String(error));
  throw new DomainError(503, 'SERVICE_UNAVAILABLE', 'Authentication service unavailable');
};

const SECURE_SESSION_COOKIE_NAME = '__Secure-better-auth.session_token';
const PLAIN_SESSION_COOKIE_NAME = 'better-auth.session_token';
const HMAC_ALGORITHM = { name: 'HMAC', hash: 'SHA-256' } as const;
const hmacKeyCache = new Map<string, Promise<CryptoKey>>();

// Match better-call's parseCookies (used by Better Auth session endpoints): first occurrence wins.
const parseRequestCookies = (cookieHeader: string): Map<string, string> => {
  const cookies = new Map<string, string>();
  let index = 0;

  while (index < cookieHeader.length) {
    const eqIdx = cookieHeader.indexOf('=', index);

    if (eqIdx === -1) break;
    let endIdx = cookieHeader.indexOf(';', index);

    if (endIdx === -1) {
      endIdx = cookieHeader.length;
    } else if (endIdx < eqIdx) {
      index = cookieHeader.lastIndexOf(';', eqIdx - 1) + 1;
      continue;
    }

    const key = cookieHeader.slice(index, eqIdx).trim();

    if (!cookies.has(key)) {
      let val = cookieHeader.slice(eqIdx + 1, endIdx).trim();

      if (val.codePointAt(0) === 34) val = val.slice(1, -1);

      try {
        cookies.set(key, decodeURIComponent(val));
      } catch {
        cookies.set(key, val);
      }
    }

    index = endIdx + 1;
  }

  return cookies;
};

const resolveSessionCookieName = (env: ApiEnv['Bindings']): string | null => {
  const raw = env.BETTER_AUTH_URL?.trim();

  if (!raw) return null;

  try {
    return new URL(raw).protocol === 'https:'
      ? SECURE_SESSION_COOKIE_NAME
      : PLAIN_SESSION_COOKIE_NAME;
  } catch {
    return null;
  }
};

const getSessionHmacKey = (secret: string) => {
  let cached = hmacKeyCache.get(secret);

  if (!cached) {
    cached = crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      HMAC_ALGORITHM,
      false,
      ['verify'],
    );
    hmacKeyCache.set(secret, cached);
  }

  return cached;
};

const verifySignedSessionToken = async (
  signedValue: string,
  secret: string,
): Promise<string | null> => {
  const dotIndex = signedValue.lastIndexOf('.');

  if (dotIndex <= 0) return null;
  const token = signedValue.slice(0, dotIndex);
  const base64Signature = signedValue.slice(dotIndex + 1);

  try {
    const binary = atob(base64Signature);
    const signature = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i += 1) {
      signature[i] = binary.charCodeAt(i);
    }

    const key = await getSessionHmacKey(secret);

    const valid = await crypto.subtle.verify(
      HMAC_ALGORITHM,
      key,
      signature,
      new TextEncoder().encode(token),
    );

    return valid ? token : null;
  } catch {
    return null;
  }
};

const readSessionByToken = async (env: ApiEnv['Bindings'], token: string) =>
  env.USER_DB.prepare(`
    SELECT
      s.id AS sessionId,
      u.id AS userId,
      u.email AS email,
      u.email_verified AS emailVerified,
      u.name AS name,
      EXISTS (SELECT 1 FROM admin_user_flags WHERE user_id = u.id) AS disabled
    FROM session s
    JOIN user u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > ?
    LIMIT 1
  `)
    .bind(token, Date.now())
    .first<{
      sessionId: string;
      userId: string;
      email: string;
      emailVerified: number | boolean;
      name: string;
      disabled: number;
    }>();

export const resolveAuthenticatedUser = async (
  c: Context<ApiEnv>,
): Promise<AuthenticatedAppUser | null> => {
  const cookieHeader = c.req.raw.headers.get('cookie');

  if (!cookieHeader) {
    return null;
  }

  const parsedCookies = parseRequestCookies(cookieHeader);
  const expectedCookieName = resolveSessionCookieName(c.env);

  if (expectedCookieName) {
    const cookieValue = parsedCookies.get(expectedCookieName);

    if (!cookieValue) {
      return null;
    }

    const secret = c.env.BETTER_AUTH_SECRET?.trim();

    if (secret && cookieValue.includes('.')) {
      const token = await verifySignedSessionToken(cookieValue, secret);

      if (!token) return null;

      const row = await readSessionByToken(c.env, token).catch(
        // oxlint-disable-next-line anti-slop/no-unknown-parameters -- database adapter failures cross the async boundary as unknown.
        (error: unknown) => throwAuthenticationUnavailable(c, error),
      );

      if (!row) return null;

      if (row.disabled === 1) throw new DomainError(403, 'USER_DISABLED', 'USER_DISABLED');

      return {
        userId: row.userId,
        sessionId: row.sessionId,
        email: row.email,
        emailVerified: Boolean(row.emailVerified),
        name: row.name,
      };
    }
  } else if (
    !parsedCookies.has(SECURE_SESSION_COOKIE_NAME) &&
    !parsedCookies.has(PLAIN_SESSION_COOKIE_NAME)
  ) {
    return null;
  }

  const auth = createBetterAuth(c.env);
  const requestHeaders = new Headers();
  requestHeaders.set('cookie', cookieHeader);

  const session = await auth.api
    .getSession({ headers: requestHeaders, query: { disableRefresh: true } })
    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- authentication SDK failures cross the adapter as unknown.
    .catch((error: unknown) => throwAuthenticationUnavailable(c, error));

  if (!session?.user || !session.session?.id) {
    return null;
  }

  const access = await readRequestSessionAccess(c.env, session.user.id, session.session.id).catch(
    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- database adapter failures cross the async boundary as unknown.
    (error: unknown) => throwAuthenticationUnavailable(c, error),
  );

  if (access.disabled) throw new DomainError(403, 'USER_DISABLED', 'USER_DISABLED');

  if (!access.active) return null;

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
