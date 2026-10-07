import type { DatabaseType } from '@ddlbuilder/shared-types';
import { expandDatabaseFamilies } from './databaseFamily.js';

export const DEFAULT_IDENTIFIER_NAME_MAX_LENGTH = 64;

const IDENTIFIER_NAME_MAX_LENGTHS = expandDatabaseFamilies({
  mysql: DEFAULT_IDENTIFIER_NAME_MAX_LENGTH,
  sqlite: DEFAULT_IDENTIFIER_NAME_MAX_LENGTH,
  postgresql: 63,
  oracle: 30,
  sqlserver: 128,
  dm: 128,
  hive: 128,
});

const generateShortHash = (value: string): string => {
  let hash = 5381;

  for (let index = 0; index < value.length; index++) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }

  return Math.abs(hash).toString(36).slice(-4).padStart(4, '0');
};

export const getIdentifierNameMaxLength = (dbType: DatabaseType): number =>
  IDENTIFIER_NAME_MAX_LENGTHS[dbType];

export const truncateIdentifierName = (
  name: string,
  maxLength: number = DEFAULT_IDENTIFIER_NAME_MAX_LENGTH,
): string => {
  if (name.length <= maxLength) return name;
  const hash = generateShortHash(name);

  return `${name.slice(0, Math.max(0, maxLength - hash.length - 1))}_${hash}`.slice(0, maxLength);
};

export const buildIndexName = (
  prefix: 'idx' | 'uk' | 'pk' | 'fk',
  tableName: string,
  fieldNames: string[],
  maxLength: number = DEFAULT_IDENTIFIER_NAME_MAX_LENGTH,
): string => {
  const fields = fieldNames.join('_');
  const fullName = fields ? `${prefix}_${tableName}_${fields}` : `${prefix}_${tableName}`;

  return truncateIdentifierName(fullName, maxLength);
};
