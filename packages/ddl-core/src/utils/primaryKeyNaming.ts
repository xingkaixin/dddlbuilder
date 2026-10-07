import type { DatabaseType, IndexDefinition } from '@ddlbuilder/shared-types';
import { getSchemaAndTable } from './databaseTypeMapping.js';
import {
  DEFAULT_IDENTIFIER_NAME_MAX_LENGTH,
  getIdentifierNameMaxLength,
  truncateIdentifierName,
} from './identifierNaming.js';
import { unquoteSqlIdentifier } from './sqlIdentifiers.js';

export const buildPrimaryKeyName = (
  tableName: string,
  maxLength: number = DEFAULT_IDENTIFIER_NAME_MAX_LENGTH,
) => {
  const { table } = getSchemaAndTable(tableName);
  const base = unquoteSqlIdentifier(table || tableName.trim());

  return truncateIdentifierName(base ? `pk_${base}` : 'pk', maxLength);
};

/** CREATE 与 ALTER/回滚共用，保证生成和删除的是同一个约束名。 */
export const resolveIndexName = (
  tableName: string,
  index: IndexDefinition,
  dbType: DatabaseType,
): string => {
  if (index.kind !== 'primary') return index.name;
  const maxLength = getIdentifierNameMaxLength(dbType);

  return truncateIdentifierName(
    index.name.trim() || buildPrimaryKeyName(tableName, maxLength),
    maxLength,
  );
};
