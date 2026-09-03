import type { ApiEnv } from './context.js';

const ADMIN_COOKIE_NAME = 'ddlbuilder_admin_session';
const ADMIN_COOKIE_PATH = '/api/admin';
const ADMIN_SESSION_MAX_AGE = 14400; // 4 hours
const ADMIN_SESSION_MAX_AGE_MS = ADMIN_SESSION_MAX_AGE * 1000;
const ADMIN_SESSION_SECRET_MIN_BYTES = 32;
const SEPARATOR = '.';

type AdminAuthEnv = Pick<
  ApiEnv['Bindings'],
  'USER_DB' | 'ADMIN_CONSOLE_PASSWORD' | 'ADMIN_SESSION_SECRET'
>;

const encode = (value: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(new TextEncoder().encode(value));

const timingSafeEqual = (a: Uint8Array, b: Uint8Array): boolean => {
  let mismatch = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    mismatch |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return mismatch === 0;
};

const readAdminAuthConfig = (
  env: AdminAuthEnv,
): { password: string; sessionKey: Uint8Array<ArrayBuffer> } | null => {
  const password = env.ADMIN_CONSOLE_PASSWORD;
  const sessionSecret = env.ADMIN_SESSION_SECRET;
  if (!password || !sessionSecret?.trim()) return null;

  const sessionKey = encode(sessionSecret);
  if (
    sessionKey.byteLength < ADMIN_SESSION_SECRET_MIN_BYTES ||
    timingSafeEqual(sessionKey, encode(password))
  ) {
    return null;
  }

  return { password, sessionKey };
};

const hmacSign = async (key: BufferSource, data: string): Promise<string> => {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
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
  env: AdminAuthEnv,
  password: string,
): Promise<{ success: true; setCookie: string } | { success: false }> => {
  const config = readAdminAuthConfig(env);
  if (!config) return { success: false };

  const a = encode(password);
  const b = encode(config.password);
  if (!timingSafeEqual(a, b)) {
    return { success: false };
  }

  const uuid = crypto.randomUUID();
  const createdAt = Date.now();
  const expiresAt = createdAt + ADMIN_SESSION_MAX_AGE_MS;
  const payload = `${uuid}${SEPARATOR}${expiresAt}`;
  const mac = await hmacSign(config.sessionKey, payload);
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
  env: AdminAuthEnv,
  cookieHeader: string | null | undefined,
): Promise<boolean> => {
  const config = readAdminAuthConfig(env);
  if (!config) return false;

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
  const expected = await hmacSign(config.sessionKey, payload);
  const actualBytes = encode(mac);
  const expectedBytes = encode(expected);
  if (!timingSafeEqual(actualBytes, expectedBytes)) {
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
  env: AdminAuthEnv,
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
