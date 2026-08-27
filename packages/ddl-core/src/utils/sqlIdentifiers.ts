import type { DatabaseType } from '@ddlbuilder/shared-types';
import { RESERVED_KEYWORDS } from '../configs/reservedKeywords';
import { getDatabaseFamily, quoteIdentifier } from './databaseFamily';

export function unquoteSqlIdentifier(value: string): string {
  const quoted = value.match(/^(?:"((?:[^"]|"")*)"|`((?:[^`]|``)*)`|\[((?:[^\]]|\]\])*)\])$/);
  if (!quoted) return value;
  return (
    quoted[1]?.replace(/""/g, '"') ??
    quoted[2]?.replace(/``/g, '`') ??
    quoted[3].replace(/\]\]/g, ']')
  );
}

export function formatSqlIdentifier(name: string, dbType: DatabaseType): string {
  const value = name.trim();
  if (!value) return '';
  const unquoted = unquoteSqlIdentifier(value);
  if (unquoted !== value) return quoteIdentifier(unquoted, dbType);
  const lower = value.toLowerCase();
  if (
    /^[a-z_][a-z0-9_$]*$/i.test(value) &&
    !RESERVED_KEYWORDS[dbType]?.has(lower) &&
    (getDatabaseFamily(dbType) !== 'postgresql' || value === lower)
  ) {
    return value;
  }
  return quoteIdentifier(value, dbType);
}
