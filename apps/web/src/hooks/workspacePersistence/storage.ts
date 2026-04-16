import { STORAGE_KEY } from '@/utils/constants';

const SHARE_UUID_REGEX =
  /^\/share\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

export const writeStorageJson = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore localStorage quota errors
  }
};

export const readStorageJson = <T>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
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

export const fireAndForget = (task: Promise<unknown>) => {
  void task.catch(() => {
    // ignore persistence errors
  });
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
