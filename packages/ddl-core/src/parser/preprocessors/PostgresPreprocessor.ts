import type { PreprocessResult } from './types.js';

// node-sql-parser 丢弃表名的引号信息；在构造 AST 前完成未引用标识符的大小写折叠。
export function foldUnquotedPostgresIdentifiers(sql: string): string {
  const tokens = /[eE]'|'|"|--|\/\*|\$(?:[\p{L}_][\p{L}\p{N}_]*)?\$|[\p{L}_][\p{L}\p{N}_$]*/gu;
  const parts: string[] = [];
  let offset = 0;
  for (let match = tokens.exec(sql); match; match = tokens.exec(sql)) {
    const token = match[0];
    let end = tokens.lastIndex;
    let replacement = token;
    if (token === '--') {
      while (end < sql.length && sql[end] !== '\n' && sql[end] !== '\r') end++;
    } else if (token === '/*') {
      let depth = 1;
      while (end < sql.length && depth > 0) {
        const pair = sql.slice(end, end + 2);
        if (pair === '/*' || pair === '*/') {
          depth += pair === '/*' ? 1 : -1;
          end += 2;
        } else {
          end++;
        }
      }
    } else if (token.startsWith('$')) {
      const closing = sql.indexOf(token, end);
      end = closing < 0 ? sql.length : closing + token.length;
    } else if (token.endsWith("'") || token === '"') {
      const quote = token.at(-1);
      while (end < sql.length) {
        const char = sql[end++];
        if (char === '\\' && token.length === 2) {
          end = Math.min(end + 1, sql.length);
        } else if (char === quote) {
          if (sql[end] !== quote) break;
          end++;
        }
      }
    } else {
      replacement = token.toLowerCase();
    }
    if (end !== tokens.lastIndex) replacement = sql.slice(match.index, end);
    parts.push(sql.slice(offset, match.index), replacement);
    offset = end;
    tokens.lastIndex = end;
  }
  return parts.join('') + sql.slice(offset);
}

/**
 * Extract standalone COMMENT ON statements from PostgreSQL SQL
 *
 * Handles:
 * - COMMENT ON TABLE ... IS '...';
 * - COMMENT ON COLUMN ... IS '...';
 */
export function extractStandaloneComments(sql: string): PreprocessResult {
  const metadataByTable = new Map<string, PreprocessResult['tableMetadata'][number]>();
  const unescapeComment = (value: string) => value.replace(/''/g, "'");
  const getTableMetadata = (tableName: string) => {
    const existing = metadataByTable.get(tableName);
    if (existing) return existing;
    const metadata: PreprocessResult['tableMetadata'][number] = {
      tableName,
      tableComment: '',
      columnComments: {},
    };
    metadataByTable.set(tableName, metadata);
    return metadata;
  };

  const cleanedSql = sql
    .replace(
      /COMMENT\s+ON\s+TABLE\s+([\w".]+)\s+IS\s+'((?:''|[^'])*)'\s*;/gi,
      (_m, tableName, comment) => {
        getTableMetadata(tableName).tableComment = unescapeComment(comment);
        return '';
      },
    )
    .replace(
      /COMMENT\s+ON\s+COLUMN\s+([\w".]+)\.(["\w]+)\s+IS\s+'((?:''|[^'])*)'\s*;/gi,
      (_m, tableName, column, comment) => {
        const colName = column.replace(/"/g, '');
        getTableMetadata(tableName).columnComments[colName] = unescapeComment(comment);
        return '';
      },
    );

  return { sql: cleanedSql, tableMetadata: Array.from(metadataByTable.values()) };
}
