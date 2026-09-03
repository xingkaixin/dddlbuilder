import type { DatabaseType, NormalizedField } from '@ddlbuilder/shared-types';
import { DIALECT_PROFILES } from '../strategies/dialectProfiles.js';
import {
  formatConstantDefaultExpression,
  getCanonicalBaseType,
  supportsAutoIncrement,
  supportsDefaultCurrentTimestamp,
  supportsUuidDefault,
} from './databaseTypeMapping.js';

export type ResolvedFieldDefault =
  | { kind: 'none' }
  | { kind: 'auto_increment' }
  | { kind: 'constant'; value: string; sqlExpression: string }
  | { kind: 'expression'; sqlExpression: string }
  | { kind: 'current_timestamp'; sqlExpression: string }
  | { kind: 'uuid'; sqlExpression: string };

export function resolveFieldDefault(
  field: NormalizedField,
  dbType: DatabaseType,
): ResolvedFieldDefault {
  const canonicalType = getCanonicalBaseType(field.type);

  switch (field.defaultKind) {
    case 'none':
      return { kind: 'none' };
    case 'auto_increment':
      return supportsAutoIncrement(dbType, canonicalType)
        ? { kind: 'auto_increment' }
        : { kind: 'none' };
    case 'constant': {
      const constantExpression = formatConstantDefaultExpression(
        canonicalType,
        field.defaultValue,
        dbType,
      );
      const sqlExpression = DIALECT_PROFILES[dbType].expressionDefaultTypes?.has(canonicalType)
        ? `(${constantExpression})`
        : constantExpression;
      return constantExpression
        ? { kind: 'constant', value: field.defaultValue, sqlExpression }
        : { kind: 'none' };
    }
    case 'expression': {
      const sqlExpression = field.defaultValue.trim();
      return sqlExpression ? { kind: 'expression', sqlExpression } : { kind: 'none' };
    }
    case 'current_timestamp':
      return supportsDefaultCurrentTimestamp(dbType, field.type)
        ? {
            kind: 'current_timestamp',
            sqlExpression: DIALECT_PROFILES[dbType].nowFunction(canonicalType),
          }
        : { kind: 'none' };
    case 'uuid': {
      const sqlExpression = DIALECT_PROFILES[dbType].uuidFunction;
      return sqlExpression && supportsUuidDefault(canonicalType)
        ? { kind: 'uuid', sqlExpression }
        : { kind: 'none' };
    }
  }
}
