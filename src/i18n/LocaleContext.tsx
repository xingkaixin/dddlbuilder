import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import i18n from './index';
import {
  LOCAL_STORAGE_KEY,
  type AppLocale,
  resolveInitialLocale,
  normalizeLocale,
} from './types';

interface LocaleContextValue {
  locale: AppLocale;
  resolvedLocale: AppLocale;
  setLocale: (locale: AppLocale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>(() =>
    resolveInitialLocale(),
  );

  const setLocale = useCallback((nextLocale: AppLocale) => {
    setLocaleState(nextLocale);
    try {
      window.localStorage.setItem(LOCAL_STORAGE_KEY, nextLocale);
    } catch {
      // ignore storage errors
    }
  }, []);

  useEffect(() => {
    void i18n.changeLanguage(locale);
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    const fromI18n = normalizeLocale(i18n.resolvedLanguage) ?? locale;
    if (fromI18n !== locale) {
      setLocaleState(fromI18n);
    }
  }, [locale]);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      resolvedLocale: normalizeLocale(i18n.resolvedLanguage) ?? locale,
      setLocale,
    }),
    [locale, setLocale],
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error('useLocale must be used within LocaleProvider');
  }
  return context;
}
