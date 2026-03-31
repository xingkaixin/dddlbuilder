import type { NormalizedField, DatabaseType } from '@/types';
import {
  getCanonicalBaseType,
  supportsDefaultCurrentTimestamp,
  supportsUuidDefault,
  formatConstantDefault,
} from '../databaseTypeMapping';

export function buildDefaultClause(field: NormalizedField, dbType: DatabaseType): string {
  const base = getCanonicalBaseType(field.type);

  if (field.defaultKind === 'constant') {
    return formatConstantDefault(base, field.defaultValue);
  }

  if (field.defaultKind === 'uuid' && supportsUuidDefault(base)) {
    if (dbType === 'mysql' || dbType === 'mariadb' || dbType === 'tidb') {
      return 'DEFAULT (UUID())';
    }
    if (dbType === 'postgresql' || dbType === 'postgresql-citus') {
      return 'DEFAULT gen_random_uuid()';
    }
  }

  if (field.defaultKind === 'current_timestamp' && supportsDefaultCurrentTimestamp(dbType, base)) {
    if (dbType === 'sqlserver') {
      return 'DEFAULT GETDATE()';
    }
    return 'DEFAULT CURRENT_TIMESTAMP';
  }

  return '';
}
