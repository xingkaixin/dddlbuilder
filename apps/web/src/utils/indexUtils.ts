import type { DatabaseType, IndexDefinition } from '@ddlbuilder/shared-types';
import {
  buildIndexName,
  buildPrimaryKeyName,
  getIdentifierNameMaxLength,
} from '@ddlbuilder/ddl-core';
import { toStringSafe } from './helpers';

export const fillMissingIndexNames = (
  indexes: IndexDefinition[],
  tableName: string,
  dbType: DatabaseType,
): IndexDefinition[] => {
  const maxLength = getIdentifierNameMaxLength(dbType);
  return indexes.map((index) =>
    index.name?.trim()
      ? index
      : {
          ...index,
          name: index.isPrimary
            ? buildPrimaryKeyName(tableName, maxLength)
            : buildIndexName(
                index.unique ? 'uk' : 'idx',
                tableName,
                index.fields.map((field) => field.name),
                maxLength,
              ),
        },
  );
};

export const sanitizeIndexesForPersist = (indexes: IndexDefinition[]): IndexDefinition[] =>
  indexes
    .map((index) => ({
      id: index.id,
      name: toStringSafe(index.name).trim(),
      fields: index.fields.map((field) => ({
        name: toStringSafe(field.name).trim(),
        direction:
          field.direction === 'ASC' || field.direction === 'DESC' ? field.direction : 'ASC',
      })),
      unique: Boolean(index.unique),
      isPrimary: Boolean(index.isPrimary),
    }))
    .filter((index) => index.name && index.fields.length > 0);
