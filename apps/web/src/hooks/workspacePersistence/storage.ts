import { STORAGE_KEY } from '@/utils/constants';

const SHARE_UUID_REGEX =
  /^\/share\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

const SHARE_PREFIX = `${STORAGE_KEY}:share:`;
const SHARE_ORDER_KEY = `${STORAGE_KEY}:share-cache-order:v1`;
const MAX_CACHED_SHARES = 5;

const rememberShare = (key: string) => {
  if (!key.startsWith(SHARE_PREFIX)) return;
  const stored: unknown = JSON.parse(localStorage.getItem(SHARE_ORDER_KEY) ?? '[]');
  const known = Array.isArray(stored)
    ? stored.filter(
        (item): item is string =>
          typeof item === 'string' &&
          item.startsWith(SHARE_PREFIX) &&
          localStorage.getItem(item) !== null,
      )
    : [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const oldKey = localStorage.key(i);
    if (oldKey?.startsWith(SHARE_PREFIX)) known.push(oldKey);
  }
  const order = [...new Set([key, ...known])];
  for (const stale of order.slice(MAX_CACHED_SHARES)) localStorage.removeItem(stale);
  localStorage.setItem(SHARE_ORDER_KEY, JSON.stringify(order.slice(0, MAX_CACHED_SHARES)));
};

export const writeStorageJson = (key: string, value: unknown) => {
  try {
    rememberShare(key);
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn('[workspace] share cache write failed', error);
  }
};

export const readStorageJson = <T>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw) as T;
    rememberShare(key);
    return value;
  } catch {
    return null;
  }
};

export const removeStorage = (key: string) => {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore localStorage errors
  }
};

export const buildShareStorageKey = (shareId: string) => `${STORAGE_KEY}:share:${shareId}`;

export const parseSharePath = (pathname: string): { shareId: string | null; invalid: boolean } => {
  if (!pathname.startsWith('/share/')) {
    return { shareId: null, invalid: false };
  }
  const match = pathname.match(SHARE_UUID_REGEX);
  if (!match) {
    return { shareId: null, invalid: true };
  }
  return { shareId: match[1], invalid: false };
};
