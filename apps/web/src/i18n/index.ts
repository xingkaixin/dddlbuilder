import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { enUSCommon } from './locales/en-US/common';
import { zhCNCommon } from './locales/zh-CN/common';
import { resolveInitialLocale } from './types';

const resources = {
  'zh-CN': {
    translation: zhCNCommon,
  },
  'en-US': {
    translation: enUSCommon,
  },
};

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources,
    lng: resolveInitialLocale(),
    fallbackLng: 'zh-CN',
    interpolation: {
      escapeValue: false,
    },
    returnNull: false,
  });
}

export default i18n;
