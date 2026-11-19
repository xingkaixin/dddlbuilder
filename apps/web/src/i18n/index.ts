import i18n, { type BackendModule, type ResourceKey } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { zhCNCommon } from './locales/zh-CN/common';
import { resolveInitialLocale } from './types';

export const loadLocaleResource = async (language: string): Promise<ResourceKey> => {
  if (language === 'zh-CN') return zhCNCommon;

  if (language === 'en-US') {
    const mod = await import('./locales/en-US/common');

    return mod.enUSCommon;
  }

  if (language === 'ja-JP') {
    const mod = await import('./locales/ja-JP/common');

    return mod.jaJPCommon;
  }

  return zhCNCommon;
};

const lazyLocaleBackend: BackendModule = {
  type: 'backend',
  init: () => undefined,
  read: (language, _namespace, callback) => {
    void (async () => {
      try {
        callback(null, await loadLocaleResource(language));
      } catch (error) {
        callback(error instanceof Error ? error : new Error(String(error)), null);
      }
    })();
  },
};

const initialLocale = resolveInitialLocale();

const i18nReady: Promise<unknown> = !i18n.isInitialized
  ? i18n
      .use(lazyLocaleBackend)
      .use(initReactI18next)
      .init({
        resources: {
          'zh-CN': {
            translation: zhCNCommon,
          },
        },
        partialBundledLanguages: true,
        load: 'currentOnly',
        lng: initialLocale,
        fallbackLng: 'zh-CN',
        interpolation: {
          escapeValue: false,
        },
        returnNull: false,
      })
  : Promise.resolve();

export { i18n, i18nReady };
