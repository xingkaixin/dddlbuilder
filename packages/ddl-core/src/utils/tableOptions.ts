import {
  normalizeTableMiscConfigNumbers,
  type DatabaseType,
  type TableMiscConfig,
} from '@ddlbuilder/shared-types';
import { getDatabaseFamily } from './databaseFamily.js';

export const supportsStorageOption = (dbType: DatabaseType): boolean =>
  getDatabaseFamily(dbType) === 'hive';

export const supportsEngineOption = (dbType: DatabaseType): boolean =>
  getDatabaseFamily(dbType) === 'mysql';

export const supportsCharsetOption = supportsEngineOption;

export const supportsCollationOption = supportsEngineOption;

export const supportsTablespaceOption = (dbType: DatabaseType): boolean => {
  const family = getDatabaseFamily(dbType);

  return family === 'postgresql' || family === 'oracle' || family === 'dm';
};

export const supportsFillfactorOption = (dbType: DatabaseType): boolean =>
  getDatabaseFamily(dbType) === 'postgresql';

export const supportsOracleStorageOption = (dbType: DatabaseType): boolean =>
  getDatabaseFamily(dbType) === 'oracle';

const normalizeValue = (value?: string): string => {
  const normalized = (value || '').trim();

  return normalized.toLowerCase() === 'default' ? '' : normalized;
};

export const buildTableOptionsClause = (dbType: DatabaseType, config?: TableMiscConfig): string => {
  if (!config?.enabled) return '';
  if (supportsStorageOption(dbType)) return '';
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

  if (supportsFillfactorOption(dbType) && normalizedConfig.fillfactor != null) {
    parts.push(`WITH (fillfactor = ${normalizedConfig.fillfactor})`);
  }

  if (supportsOracleStorageOption(dbType)) {
    if (normalizedConfig.pctfree != null) {
      parts.push(`PCTFREE ${normalizedConfig.pctfree}`);
    }

    if (normalizedConfig.initrans != null) {
      parts.push(`INITRANS ${normalizedConfig.initrans}`);
    }
  }

  if (supportsTablespaceOption(dbType) && tablespace) {
    parts.push(`TABLESPACE ${tablespace}`);
  }

  if (parts.length === 0) return '';

  return ` ${parts.join(' ')}`;
};
