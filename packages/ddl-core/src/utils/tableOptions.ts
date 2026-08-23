import {
  normalizeTableMiscConfigNumbers,
  type DatabaseType,
  type TableMiscConfig,
} from '@ddlbuilder/shared-types';

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

const HIVE_DBS = new Set<DatabaseType>(['hive']);

const FILLFACTOR_DBS = new Set<DatabaseType>([
  'postgresql',
  'postgresql-citus',
  'kingbase',
  'gaussdb',
]);

const ORACLE_STORAGE_DBS = new Set<DatabaseType>(['oracle', 'oceanbase-oracle']);

export const supportsStorageOption = (dbType: DatabaseType): boolean => HIVE_DBS.has(dbType);

export const supportsEngineOption = (dbType: DatabaseType): boolean => MYSQL_LIKE_DBS.has(dbType);

export const supportsCharsetOption = (dbType: DatabaseType): boolean => MYSQL_LIKE_DBS.has(dbType);

export const supportsCollationOption = (dbType: DatabaseType): boolean =>
  MYSQL_LIKE_DBS.has(dbType);

export const supportsTablespaceOption = (dbType: DatabaseType): boolean =>
  TABLESPACE_DBS.has(dbType);

export const supportsFillfactorOption = (dbType: DatabaseType): boolean =>
  FILLFACTOR_DBS.has(dbType);

export const supportsOracleStorageOption = (dbType: DatabaseType): boolean =>
  ORACLE_STORAGE_DBS.has(dbType);

const normalizeValue = (value?: string): string => {
  const normalized = (value || '').trim();
  return normalized.toLowerCase() === 'default' ? '' : normalized;
};

export const buildTableOptionsClause = (dbType: DatabaseType, config?: TableMiscConfig): string => {
  if (!config?.enabled) return '';
  if (HIVE_DBS.has(dbType)) return '';
  const normalizedConfig = normalizeTableMiscConfigNumbers(config);

  const engine = normalizeValue(normalizedConfig.engine);
  const charset = normalizeValue(normalizedConfig.charset);
  const collation = normalizeValue(normalizedConfig.collation);
  const tablespace = normalizeValue(normalizedConfig.tablespace);

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
  if (supportsFillfactorOption(dbType) && normalizedConfig.fillfactor != null) {
    parts.push(`WITH (fillfactor = ${normalizedConfig.fillfactor})`);
  }
  if (supportsOracleStorageOption(dbType)) {
    const storageParts: string[] = [];
    if (normalizedConfig.pctfree != null) {
      storageParts.push(`PCTFREE ${normalizedConfig.pctfree}`);
    }
    if (normalizedConfig.initrans != null) {
      storageParts.push(`INITRANS ${normalizedConfig.initrans}`);
    }
    if (storageParts.length > 0) {
      parts.push(`STORAGE (${storageParts.join(' ')})`);
    }
  }

  if (parts.length === 0) return '';
  return ` ${parts.join(' ')}`;
};
