import type { AppLocale } from '@/types/locale';

const DOCS_ZH_URL = '/docs/zh/';
const DOCS_EN_URL = '/docs/en/';

export function getDocsUrl(locale?: AppLocale | string | null): string {
  if (!locale) return DOCS_ZH_URL;

  const normalized = locale.toLowerCase();
  if (normalized.startsWith('zh')) return DOCS_ZH_URL;
  if (normalized.startsWith('en')) return DOCS_EN_URL;

  return DOCS_ZH_URL;
}
