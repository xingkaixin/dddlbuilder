import type { DatabaseType, TableMiscConfig } from '@/types';

const MYSQL_LIKE_DBS = new Set<DatabaseType>([
  'mysql',
  'mariadb',
  'tidb',
  'oceanbase',
  'gbase',
  'polardb',
]);

const TABLESPACE_DBS = new Set<DatabaseType>([
  'postgresql',
  'postgresql-citus',
  'kingbase',
  'gaussdb',
  'oracle',
  'oceanbase-oracle',
  'dm',
]);

export const supportsEngineOption = (dbType: DatabaseType): boolean =>
  MYSQL_LIKE_DBS.has(dbType);

export const supportsCharsetOption = (dbType: DatabaseType): boolean =>
  MYSQL_LIKE_DBS.has(dbType);

export const supportsCollationOption = (dbType: DatabaseType): boolean =>
  MYSQL_LIKE_DBS.has(dbType);

export const supportsTablespaceOption = (dbType: DatabaseType): boolean =>
  TABLESPACE_DBS.has(dbType);

const normalizeValue = (value?: string): string => {
  const normalized = (value || '').trim();
  return normalized.toLowerCase() === 'default' ? '' : normalized;
};

export const buildTableOptionsClause = (
  dbType: DatabaseType,
  config?: TableMiscConfig,
): string => {
  if (!config?.enabled) return '';

  const engine = normalizeValue(config.engine);
  const charset = normalizeValue(config.charset);
  const collation = normalizeValue(config.collation);
  const tablespace = normalizeValue(config.tablespace);

  const parts: string[] = [];

  if (supportsEngineOption(dbType) && engine) {
    parts.push(`ENGINE=${engine}`);
  }
  if (supportsCharsetOption(dbType) && charset) {
    parts.push(`DEFAULT CHARSET=${charset}`);
  }
  if (supportsCollationOption(dbType) && collation) {
    parts.push(`COLLATE=${collation}`);
  }
  if (supportsTablespaceOption(dbType) && tablespace) {
    parts.push(`TABLESPACE ${tablespace}`);
  }

  if (parts.length === 0) return '';
  return ` ${parts.join(' ')}`;
};
