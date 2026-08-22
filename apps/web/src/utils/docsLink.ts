import type { AppLocale } from '@ddlbuilder/shared-types/locale';

const DOCS_ZH_URL = '/docs/zh/';
const DOCS_EN_URL = '/docs/en/';
const DOCS_JA_URL = '/docs/ja/';

export function getDocsUrl(locale?: AppLocale | null): string {
  if (!locale) return DOCS_ZH_URL;

  const normalized = locale.toLowerCase();
  if (normalized.startsWith('zh')) return DOCS_ZH_URL;
  if (normalized.startsWith('en')) return DOCS_EN_URL;
  if (normalized.startsWith('ja')) return DOCS_JA_URL;

  return DOCS_ZH_URL;
}
