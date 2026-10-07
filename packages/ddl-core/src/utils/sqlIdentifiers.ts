import type { DatabaseType } from '@ddlbuilder/shared-types';
import { RESERVED_KEYWORDS } from '../configs/reservedKeywords.js';
import { getDatabaseFamily, quoteIdentifier } from './databaseFamily.js';

export function unquoteSqlIdentifier(value: string): string {
  const quoted = value.match(/^(?:"((?:[^"]|"")*)"|`((?:[^`]|``)*)`|\[((?:[^\]]|\]\])*)\])$/);

  if (!quoted) return value;

  return (
    quoted[1]?.replace(/""/g, '"') ??
    quoted[2]?.replace(/``/g, '`') ??
    quoted[3].replace(/\]\]/g, ']')
  );
}

/** 生成用于比较标识符恒等性的 key，不改变用户保存的名称。 */
export function getSqlIdentifierKey(name: string, dbType: DatabaseType): string {
  const source = name.trim();
  const value = unquoteSqlIdentifier(source);
  const family = getDatabaseFamily(dbType);

  if (family === 'postgresql') return value;

  if (family === 'sqlite') return value.replace(/[A-Z]/g, (letter) => letter.toLowerCase());

  if (family === 'oracle' || family === 'dm') {
    return value === source ? value.toUpperCase() : value;
  }

  return value.toLowerCase();
}

export function formatSqlIdentifier(name: string, dbType: DatabaseType): string {
  const value = name.trim();

  if (!value) return '';
  const unquoted = unquoteSqlIdentifier(value);

  if (unquoted !== value) return quoteIdentifier(unquoted, dbType);
  const lower = value.toLowerCase();
  const family = getDatabaseFamily(dbType);
  const regular = (family === 'hive' ? /^[a-z_][a-z0-9_]*$/i : /^[a-z_][a-z0-9_$]*$/i).test(value);
  const reserved = RESERVED_KEYWORDS[dbType]?.has(lower);

  if (regular && !reserved && (family !== 'postgresql' || value === lower)) {
    return value;
  }

  // 未加引号的普通名称在 Oracle/DM 中折叠为大写，与 getSqlIdentifierKey 保持同一身份。
  if (regular && reserved && (family === 'oracle' || family === 'dm')) {
    return quoteIdentifier(value.toUpperCase(), dbType);
  }

  return quoteIdentifier(value, dbType);
}
