import { escapeSqlString } from '../utils/databaseFamily';
import type { DatabaseType, NormalizedField } from '@ddlbuilder/shared-types';
import {
  getCanonicalBaseType,
  parseFieldType,
  supportsOnUpdateCurrentTimestamp,
} from '../utils/databaseTypeMapping';
import { resolveFieldDefault, type ResolvedFieldDefault } from '../utils/fieldDefault.js';
import { TypeMapper } from '../utils/TypeMapper';
import { DIALECT_PROFILES } from './dialectProfiles';

const renderDialectDefaultClause = (defaultValue: ResolvedFieldDefault) => {
  switch (defaultValue.kind) {
    case 'constant':
    case 'expression':
    case 'current_timestamp':
    case 'uuid':
      return `DEFAULT ${defaultValue.sqlExpression}`;
    case 'none':
    case 'auto_increment':
      return '';
  }
};

export const buildDialectDefaultClause = (field: NormalizedField, dbType: DatabaseType): string => {
  return renderDialectDefaultClause(resolveFieldDefault(field, dbType));
};

export const buildDialectColumn = (
  field: NormalizedField,
  dbType: DatabaseType,
  typeMapper = TypeMapper.create(dbType),
) => {
  const profile = DIALECT_PROFILES[dbType];
  const canonicalType = getCanonicalBaseType(field.type);
  const type = typeMapper.mapType(parseFieldType(field.type));
  const defaultValue = resolveFieldDefault(field, dbType);
  const segments: Record<'identity' | 'nullability' | 'default', string> = {
    identity:
      profile.identityClause && defaultValue.kind === 'auto_increment'
        ? ` ${profile.identityClause}`
        : '',
    nullability: field.nullable ? (profile.explicitNull ? ' NULL' : '') : ' NOT NULL',
    default: (() => {
      const clause = renderDialectDefaultClause(defaultValue);
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
      ? `COMMENT '${escapeSqlString(field.comment, dbType)}'`
      : undefined;

  return {
    body: `${type}${profile.clauseOrder.map((key) => segments[key]).join('')}${onUpdate}`,
    comment,
  };
};
