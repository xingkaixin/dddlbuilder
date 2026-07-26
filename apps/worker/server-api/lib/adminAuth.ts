import type { ApiEnv } from './context.js';

const ADMIN_COOKIE_NAME = 'ddlbuilder_admin_session';
const ADMIN_COOKIE_PATH = '/api/admin';
const ADMIN_SESSION_MAX_AGE = 14400; // 4 hours
const ADMIN_SESSION_MAX_AGE_MS = ADMIN_SESSION_MAX_AGE * 1000;
const SEPARATOR = '.';

const encode = (value: string) => new TextEncoder().encode(value);

const hmacSign = async (key: string, data: string): Promise<string> => {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encode(data));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

export const createAdminSession = async (
  env: ApiEnv['Bindings'],
  password: string,
): Promise<{ success: true; setCookie: string } | { success: false }> => {
  const configured = env.ADMIN_CONSOLE_PASSWORD;
  if (!configured) {
    return { success: false };
  }

  const a = encode(password);
  const b = encode(configured);
  if (a.length !== b.length || !crypto.subtle.timingSafeEqual(a, b)) {
    return { success: false };
  }

  const uuid = crypto.randomUUID();
  const createdAt = Date.now();
  const expiresAt = createdAt + ADMIN_SESSION_MAX_AGE_MS;
  const payload = `${uuid}${SEPARATOR}${expiresAt}`;
  const mac = await hmacSign(configured, payload);
  const token = `${payload}${SEPARATOR}${mac}`;
  await env.USER_DB.batch([
    env.USER_DB.prepare('DELETE FROM admin_sessions WHERE expires_at <= ?').bind(createdAt),
    env.USER_DB.prepare(
      'INSERT INTO admin_sessions (id, expires_at, created_at, revoked_at) VALUES (?, ?, ?, NULL)',
    ).bind(uuid, expiresAt, createdAt),
  ]);

  const setCookie = [
    `${ADMIN_COOKIE_NAME}=${token}`,
    `Path=${ADMIN_COOKIE_PATH}`,
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${ADMIN_SESSION_MAX_AGE}`,
    'Secure',
  ].join('; ');

  return { success: true, setCookie };
};

export const resolveAdminSession = async (
  env: ApiEnv['Bindings'],
  cookieHeader: string | null | undefined,
): Promise<boolean> => {
  const configured = env.ADMIN_CONSOLE_PASSWORD;
  if (!configured) return false;

  if (!cookieHeader) return false;

  const match = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${ADMIN_COOKIE_NAME}=`));
  if (!match) return false;

  const token = match.slice(`${ADMIN_COOKIE_NAME}=`.length);
  const parts = token.split(SEPARATOR);
  if (parts.length !== 3) return false;
  const [uuid, expiresAtRaw, mac] = parts;
  if (!uuid || !expiresAtRaw || !mac) return false;
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now()) return false;

  const payload = `${uuid}${SEPARATOR}${expiresAtRaw}`;
  const expected = await hmacSign(configured, payload);
  const actualBytes = encode(mac);
  const expectedBytes = encode(expected);
  if (
    actualBytes.length !== expectedBytes.length ||
    !crypto.subtle.timingSafeEqual(actualBytes, expectedBytes)
  ) {
    return false;
  }

  const session = await env.USER_DB.prepare(
    `
      SELECT id
      FROM admin_sessions
      WHERE id = ? AND expires_at = ? AND expires_at > ? AND revoked_at IS NULL
      LIMIT 1
    `,
  )
    .bind(uuid, expiresAt, Date.now())
    .first<{ id: string }>();
  return Boolean(session);
};

const expiredAdminCookie = () =>
  [
    `${ADMIN_COOKIE_NAME}=`,
    `Path=${ADMIN_COOKIE_PATH}`,
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    'Secure',
  ].join('; ');

export const deleteAdminSession = async (
  env: ApiEnv['Bindings'],
  cookieHeader: string | null | undefined,
): Promise<string> => {
  const match = cookieHeader
    ?.split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${ADMIN_COOKIE_NAME}=`));
  const sessionId = match?.slice(`${ADMIN_COOKIE_NAME}=`.length).split(SEPARATOR)[0];
  if (sessionId) {
    await env.USER_DB.prepare(
      'UPDATE admin_sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL',
    )
      .bind(Date.now(), sessionId)
      .run();
  }
  return expiredAdminCookie();
};
