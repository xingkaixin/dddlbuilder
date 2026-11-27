import { APP_URL } from './site';

export interface DocPresetTarget {
  id: string;
  href: string;
}

interface RoutePresetConfig {
  id: string;
  query?: string;
}

const ROUTE_PRESETS = new Map<string, RoutePresetConfig>([
  ['/basic/getting-started', { id: 'user-profile' }],
  ['/basic/core-concepts', { id: 'user-profile' }],
  ['/basic/table-and-fields', { id: 'user-profile' }],
  ['/basic/index-auth-misc', { id: 'postgresql-orders', query: 'tab=indexes' }],
  ['/basic/ddl-and-share', { id: 'user-profile' }],
  ['/basic/saved-tables', { id: 'user-profile' }],
  ['/advanced/partition-and-sharding', { id: 'mysql-partition', query: 'tab=partition' }],
  ['/advanced/foreign-key-and-er', { id: 'mysql-er-orders', query: 'tab=foreignKeys' }],
  ['/advanced/orm-generation', { id: 'sql-to-er-prisma', query: 'output=orm' }],
  ['/advanced/diff-and-rollback', { id: 'user-profile' }],
  ['/advanced/schema-lint', { id: 'mysql-partition' }],
  ['/advanced/mock-data-and-enum', { id: 'user-profile' }],
  ['/advanced/blueprint-templates', { id: 'postgresql-orders' }],
  ['/advanced/import-and-parse', { id: 'mysql-partition' }],
  ['/advanced/business-data-import', { id: 'user-profile' }],
  ['/advanced/database-tools', { id: 'postgresql-orders' }],
  ['/advanced/modeling-workflows', { id: 'mysql-er-orders' }],
  ['/advanced/view-and-routine', { id: 'postgresql-orders' }],
  ['/advanced/field-standards', { id: 'user-profile' }],
  ['/advanced/ai-workflow', { id: 'user-profile' }],
  ['/advanced/review-and-explain', { id: 'mysql-partition' }],
  ['/advanced/webmcp', { id: 'user-profile' }],
  ['/scenarios/mysql-ddl', { id: 'mysql-partition' }],
  ['/scenarios/postgresql-ddl', { id: 'postgresql-orders' }],
  ['/scenarios/sql-to-er-and-prisma', { id: 'sql-to-er-prisma' }],
  ['/scenarios/dm-oracle-ddl', { id: 'dm-oracle' }],
]);

const PAGE_LOCALE = /^\/(?:zh|en|ja)(?=\/)/;

export function presetForDoc(route: string, frontmatterPreset?: string): DocPresetTarget | null {
  const normalized = route.replace(PAGE_LOCALE, '');

  if (normalized.startsWith('/changelog/')) return null;

  if (frontmatterPreset) {
    return {
      id: frontmatterPreset,
      href: `${APP_URL}?preset=${encodeURIComponent(frontmatterPreset)}`,
    };
  }

  const mapped = ROUTE_PRESETS.get(normalized) ?? { id: 'user-profile' };
  const suffix = mapped.query ? `&${mapped.query}` : '';

  return {
    id: mapped.id,
    href: `${APP_URL}?preset=${encodeURIComponent(mapped.id)}${suffix}`,
  };
}
