import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { toast } from 'sonner';
import { i18n, loadLocaleResource } from './index';
import { DEFAULT_LOCALE, LOCAL_STORAGE_KEY, normalizeLocale } from './types';
import { type AppLocale } from '@ddlbuilder/shared-types/locale';

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

const readLocale = () => normalizeLocale(i18n.resolvedLanguage) ?? DEFAULT_LOCALE;

let requestedLocale: AppLocale | undefined;

const setLocale = async (nextLocale: AppLocale) => {
  requestedLocale = nextLocale;

  try {
    if (!i18n.hasResourceBundle(nextLocale, 'translation')) {
      const resource = await loadLocaleResource(nextLocale);
      i18n.addResourceBundle(nextLocale, 'translation', resource);
    }

    if (requestedLocale !== nextLocale) return;
    await i18n.changeLanguage(nextLocale);
  } catch {
    if (requestedLocale === nextLocale) toast.error(i18n.t('locale.loadFailed'));

    return;
  }

  if (requestedLocale !== nextLocale) return;

  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, nextLocale);
  } catch {
    // The selected language still applies when storage is unavailable.
  }
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
