import { isAppLocale, type AppLocale } from '@/types/locale';

export const LOCAL_STORAGE_KEY = 'ddlbuilder:locale:v1';

export const DEFAULT_LOCALE: AppLocale = 'zh-CN';

function getStorageItem(key: string): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const storage = window.localStorage;
  if (!storage || typeof storage.getItem !== 'function') {
    return null;
  }

  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function isSupportedLocale(value: string): value is AppLocale {
  return isAppLocale(value);
}

export function normalizeLocale(value: string | null | undefined): AppLocale | null {
  if (!value) return null;
  if (isSupportedLocale(value)) return value;

  const lowerValue = value.toLowerCase();
  if (lowerValue.startsWith('zh')) return 'zh-CN';
  if (lowerValue.startsWith('en')) return 'en-US';
  return null;
}

export function resolveNavigatorLocale(): AppLocale {
  if (typeof navigator === 'undefined') {
    return DEFAULT_LOCALE;
  }

  const candidates = Array.isArray(navigator.languages)
    ? navigator.languages
    : [navigator.language];

  for (const candidate of candidates) {
    const normalized = normalizeLocale(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return DEFAULT_LOCALE;
}

export function resolveInitialLocale(): AppLocale {
  if (typeof window === 'undefined') {
    return DEFAULT_LOCALE;
  }

  const saved = normalizeLocale(getStorageItem(LOCAL_STORAGE_KEY));
  if (saved) {
    return saved;
  }

  return resolveNavigatorLocale();
}
