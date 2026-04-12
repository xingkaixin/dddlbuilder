import type { ApiEnv } from './context.js';

const ADMIN_COOKIE_NAME = 'ddlbuilder_admin_session';
const ADMIN_COOKIE_PATH = '/api/admin';
const ADMIN_SESSION_MAX_AGE = 14400; // 4 hours
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
  const mac = await hmacSign(configured, uuid);
  const token = `${uuid}${SEPARATOR}${mac}`;

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
  const sepIndex = token.indexOf(SEPARATOR);
  if (sepIndex === -1) return false;

  const uuid = token.slice(0, sepIndex);
  const mac = token.slice(sepIndex + 1);

  const expected = await hmacSign(configured, uuid);
  return mac === expected;
};

export const deleteAdminSession = (): string => {
  return [
    `${ADMIN_COOKIE_NAME}=`,
    `Path=${ADMIN_COOKIE_PATH}`,
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    'Secure',
  ].join('; ');
};
