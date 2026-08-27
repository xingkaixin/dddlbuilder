import type { DatabaseType } from '@ddlbuilder/shared-types';
import { getDatabaseFamily, getSqlIdentifierKey } from '@ddlbuilder/ddl-core';

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function containsSqlIdentifierToken(
  source: string,
  token: string,
  dbType: DatabaseType,
): boolean {
  if (!source || !token) return false;
  const escapedToken = escapeRegExp(token);
  return new RegExp(
    `(^|[^\\p{L}\\p{N}_])${escapedToken}(?=[^\\p{L}\\p{N}_]|$)`,
    getDatabaseFamily(dbType) === 'postgresql' ? 'u' : 'iu',
  ).test(source);
}

/**
 * 仅在“标识符边界”上替换字段名，避免误替换更长单词中的子串。
 */
export function replaceIdentifierTokens(
  source: string,
  renames: ReadonlyMap<string, string>,
  dbType: DatabaseType,
  context: 'index' | 'sql' = 'index',
): string {
  if (!source || renames.size === 0) return source;
  const tokens = [...renames.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp);
  const characters = context === 'sql' ? '\\p{L}\\p{N}_' : '\\p{L}\\p{N}';
  const pattern = new RegExp(
    `(^|[^${characters}])(${tokens.join('|')})(?=[^${characters}]|$)`,
    getDatabaseFamily(dbType) === 'postgresql' ? 'gu' : 'giu',
  );
  return source.replace(
    pattern,
    (_match, prefix: string, token: string) =>
      `${prefix}${renames.get(getSqlIdentifierKey(token, dbType)) ?? token}`,
  );
}
