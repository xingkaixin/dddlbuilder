import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import i18n from './index';
import { DEFAULT_LOCALE, LOCAL_STORAGE_KEY, type AppLocale, normalizeLocale } from './types';

interface LocaleContextValue {
  locale: AppLocale;
  resolvedLocale: AppLocale;
  setLocale: (locale: AppLocale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

const subscribeLanguage = (onChange: () => void) => {
  i18n.on('languageChanged', onChange);

  return () => i18n.off('languageChanged', onChange);
};

const readLocale = () => normalizeLocale(i18n.language) ?? DEFAULT_LOCALE;

const setLocale = (nextLocale: AppLocale) => {
  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, nextLocale);
  } catch {
    // ignore storage errors
  }

  void i18n.changeLanguage(nextLocale);
};

export function LocaleProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(subscribeLanguage, readLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      resolvedLocale: locale,
      setLocale,
    }),
    [locale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);

  if (!context) {
    throw new Error('useLocale must be used within LocaleProvider');
  }

  return context;
}
