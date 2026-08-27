import type { DatabaseType } from '@ddlbuilder/shared-types';
import { RESERVED_KEYWORDS } from '../configs/reservedKeywords';
import { getDatabaseFamily, quoteIdentifier } from './databaseFamily';
import { formatSqlIdentifier, getSqlIdentifierKey, unquoteSqlIdentifier } from './sqlIdentifiers';

function expressionIdentifiers(source: string, dbType: DatabaseType) {
  const family = getDatabaseFamily(dbType);
  const mysql = family === 'mysql' || family === 'hive';
  const singleQuoted = String.raw`'(?:''|\\[\s\S]|[^'\\])*(?:'|$)`;
  const doubleQuoted = String.raw`"(?:""|\\[\s\S]|[^"\\])*(?:"|$)`;
  const quotedIdentifier = mysql
    ? '`(?:``|[^`])*(?:`|$)'
    : family === 'sqlserver'
      ? String.raw`\[(?:\]\]|[^\]])*(?:\]|$)|"(?:""|[^"])*(?:"|$)`
      : String.raw`"(?:""|[^"])*(?:"|$)`;
  const literals = [singleQuoted];
  if (mysql) literals.push(doubleQuoted);
  if (family === 'postgresql') {
    literals.push(String.raw`(?<tag>\$(?:[a-zA-Z_][\w]*)?\$)[\s\S]*?(?:\k<tag>|$)`);
  }
  const comments = mysql ? String.raw`--(?=\s|$)[^\r\n]*|#[^\r\n]*` : String.raw`--[^\r\n]*`;
  const pattern = new RegExp(
    [
      String.raw`(?<comment>\/\*[\s\S]*?(?:\*\/|$)|${comments})`,
      `(?<literal>${literals.join('|')})`,
      `(?<quoted>${quotedIdentifier})`,
      String.raw`(?<word>[\p{L}_$][\p{L}\p{N}_$]*)`,
      String.raw`(?:\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)|[^\s]`,
    ].join('|'),
    'gu',
  );
  const tokens = [...source.matchAll(pattern)].filter((token) => !token.groups?.comment);
  return tokens
    .filter((token, index) => {
      const { word, quoted } = token.groups ?? {};
      if (!word && !quoted) return false;
      const next = tokens[index + 1];
      if (next?.[0] === '(' || next?.[0] === '.') return false;
      if (quoted) return true;
      if (RESERVED_KEYWORDS[dbType].has(word.toLowerCase())) return false;
      if (next?.groups?.literal && token.index + token[0].length === next.index) return false;
      const previous = tokens[index - 1]?.[0].toLowerCase();
      if (previous === ':' || previous === 'as' || previous === 'collate') return false;
      // EXTRACT 的第一个参数是时间单位，不是列引用。
      return !(
        previous === '(' &&
        tokens[index - 2]?.[0].toLowerCase() === 'extract' &&
        next?.[0].toLowerCase() === 'from'
      );
    })
    .map((token) => ({
      start: token.index,
      end: token.index + token[0].length,
      quoted: !!token.groups?.quoted,
      name: getSqlIdentifierKey(
        family === 'postgresql' && token.groups?.word ? token[0].toLowerCase() : token[0],
        dbType,
      ),
    }));
}

export function sqlExpressionReferencesField(
  source: string,
  fieldName: string,
  dbType: DatabaseType,
): boolean {
  const key = getSqlIdentifierKey(fieldName, dbType);
  return expressionIdentifiers(source, dbType).some((identifier) => identifier.name === key);
}

export function renameSqlExpressionFields(
  source: string,
  renames: ReadonlyMap<string, string>,
  dbType: DatabaseType,
): string {
  if (!source || renames.size === 0) return source;
  const parts: string[] = [];
  let position = 0;
  for (const identifier of expressionIdentifiers(source, dbType)) {
    const name = renames.get(identifier.name);
    if (name === undefined) continue;
    parts.push(
      source.slice(position, identifier.start),
      identifier.quoted
        ? quoteIdentifier(unquoteSqlIdentifier(name.trim()), dbType)
        : formatSqlIdentifier(name, dbType),
    );
    position = identifier.end;
  }
  parts.push(source.slice(position));
  return parts.join('');
}
