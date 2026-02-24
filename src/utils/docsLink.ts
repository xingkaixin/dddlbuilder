import type { AppLocale } from '@/types/locale';

const DOCS_ZH_URL = '/docs/zh/';

/**
 * Phase 1 fallback policy: always route to Chinese docs.
 */
export function getDocsUrl(locale?: AppLocale | string | null): string {
  if (!locale) return DOCS_ZH_URL;

  const normalized = locale.toLowerCase();
  if (normalized.startsWith('zh')) return DOCS_ZH_URL;
  if (normalized.startsWith('en')) return DOCS_ZH_URL;

  return DOCS_ZH_URL;
}
