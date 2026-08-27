import type { DatabaseType } from '@ddlbuilder/shared-types';
import { getDatabaseFamily, getSqlIdentifierKey } from '@ddlbuilder/ddl-core';

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 仅在“标识符边界”上替换字段名，避免误替换更长单词中的子串。
 */
export function renameIndexNameTokens(
  source: string,
  renames: ReadonlyMap<string, string>,
  dbType: DatabaseType,
): string {
  if (!source || renames.size === 0) return source;
  const tokens = [...renames.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp);
  const pattern = new RegExp(
    `(^|[^\\p{L}\\p{N}])(${tokens.join('|')})(?=[^\\p{L}\\p{N}]|$)`,
    getDatabaseFamily(dbType) === 'postgresql' ? 'gu' : 'giu',
  );
  return source.replace(
    pattern,
    (_match, prefix: string, token: string) =>
      `${prefix}${renames.get(getSqlIdentifierKey(token, dbType)) ?? token}`,
  );
}
