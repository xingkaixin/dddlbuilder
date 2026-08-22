export const APP_LOCALES = ['zh-CN', 'en-US', 'ja-JP'] as const;

export type AppLocale = (typeof APP_LOCALES)[number];

export function isAppLocale(value: unknown): value is AppLocale {
  return APP_LOCALES.includes(value as AppLocale);
}
