import type { DatabaseType } from '@ddlbuilder/shared-types';

export const DEFAULT_IDENTIFIER_NAME_MAX_LENGTH = 64;
export const ORACLE_IDENTIFIER_NAME_MAX_LENGTH = 30;

const IDENTIFIER_NAME_MAX_LENGTHS: Partial<Record<DatabaseType, number>> = {
  postgresql: 63,
  'postgresql-citus': 63,
  kingbase: 63,
  oracle: ORACLE_IDENTIFIER_NAME_MAX_LENGTH,
  'oceanbase-oracle': ORACLE_IDENTIFIER_NAME_MAX_LENGTH,
  sqlserver: 128,
  dm: 128,
  hive: 128,
};

const generateShortHash = (value: string): string => {
  let hash = 5381;
  for (let index = 0; index < value.length; index++) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return Math.abs(hash).toString(36).slice(-4).padStart(4, '0');
};

export const getIdentifierNameMaxLength = (dbType: DatabaseType): number =>
  IDENTIFIER_NAME_MAX_LENGTHS[dbType] ?? DEFAULT_IDENTIFIER_NAME_MAX_LENGTH;

export const truncateIdentifierName = (
  name: string,
  maxLength: number = DEFAULT_IDENTIFIER_NAME_MAX_LENGTH,
): string => {
  if (name.length <= maxLength) return name;
  const hash = generateShortHash(name);
  return `${name.slice(0, Math.max(0, maxLength - hash.length - 1))}_${hash}`.slice(0, maxLength);
};

export const buildIndexName = (
  prefix: 'idx' | 'uk' | 'pk',
  tableName: string,
  fieldNames: string[],
  maxLength: number = DEFAULT_IDENTIFIER_NAME_MAX_LENGTH,
): string => {
  const fields = fieldNames.join('_');
  const fullName = fields ? `${prefix}_${tableName}_${fields}` : `${prefix}_${tableName}`;
  return truncateIdentifierName(fullName, maxLength);
};
