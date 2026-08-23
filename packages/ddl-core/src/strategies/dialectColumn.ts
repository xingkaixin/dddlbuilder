import type { DatabaseType, NormalizedField } from '@ddlbuilder/shared-types';
import {
  escapeSingleQuotes,
  formatConstantDefault,
  getCanonicalBaseType,
  parseFieldType,
  supportsAutoIncrement,
  supportsDefaultCurrentTimestamp,
  supportsOnUpdateCurrentTimestamp,
  supportsUuidDefault,
} from '../utils/databaseTypeMapping';
import { TypeMapper } from '../utils/TypeMapper';
import { DIALECT_PROFILES } from './dialectProfiles';

export const buildDialectDefaultClause = (field: NormalizedField, dbType: DatabaseType): string => {
  const canonicalType = getCanonicalBaseType(field.type);
  const profile = DIALECT_PROFILES[dbType];

  if (field.defaultKind === 'constant') {
    return formatConstantDefault(canonicalType, field.defaultValue).trimStart();
  }
  if (
    field.defaultKind === 'current_timestamp' &&
    supportsDefaultCurrentTimestamp(dbType, canonicalType)
  ) {
    return `DEFAULT ${profile.nowFunction(canonicalType)}`;
  }
  if (field.defaultKind === 'uuid' && profile.uuidFunction && supportsUuidDefault(canonicalType)) {
    return `DEFAULT ${profile.uuidFunction}`;
  }
  return '';
};

export const buildDialectColumn = (
  field: NormalizedField,
  dbType: DatabaseType,
  typeMapper = TypeMapper.create(dbType),
) => {
  const profile = DIALECT_PROFILES[dbType];
  const canonicalType = getCanonicalBaseType(field.type);
  const type = typeMapper.mapType(parseFieldType(field.type));
  const segments: Record<'identity' | 'nullability' | 'default', string> = {
    identity:
      profile.identityClause &&
      field.defaultKind === 'auto_increment' &&
      supportsAutoIncrement(dbType, canonicalType)
        ? ` ${profile.identityClause}`
        : '',
    nullability: field.nullable ? (profile.explicitNull ? ' NULL' : '') : ' NOT NULL',
    default: (() => {
      const clause = buildDialectDefaultClause(field, dbType);
      return clause ? ` ${clause}` : '';
    })(),
  };
  const onUpdate =
    field.onUpdate === 'current_timestamp' &&
    supportsOnUpdateCurrentTimestamp(dbType, canonicalType)
      ? ' ON UPDATE CURRENT_TIMESTAMP'
      : '';
  const comment =
    profile.commentChannel === 'inline' && field.comment
      ? `COMMENT '${escapeSingleQuotes(field.comment)}'`
      : undefined;

  return {
    body: `${type}${profile.clauseOrder.map((key) => segments[key]).join('')}${onUpdate}`,
    comment,
  };
};
