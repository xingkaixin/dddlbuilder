import { getSchemaAndTable } from './databaseTypeMapping.js';
import { DEFAULT_IDENTIFIER_NAME_MAX_LENGTH, truncateIdentifierName } from './identifierNaming.js';

export const buildPrimaryKeyName = (
  tableName: string,
  maxLength: number = DEFAULT_IDENTIFIER_NAME_MAX_LENGTH,
) => {
  const { table } = getSchemaAndTable(tableName);
  const base = table || tableName.trim();
  return truncateIdentifierName(base ? `pk_${base}` : 'pk', maxLength);
};
