import { mapSqlCode, splitSqlStatements, type SqlScanOptions } from '../sqlSegments.js';
import type { PreprocessResult } from './types.js';

const LEADING_SQL_TRIVIA = /^(?:\s|--[^\r\n]*|\/\*[\s\S]*?\*\/)*/;
const TABLE_COMMENT_PATTERN = /^COMMENT\s+ON\s+TABLE\s+([\w".]+)\s+IS\s+'((?:''|[^'])*)'\s*;$/i;
const COLUMN_COMMENT_PATTERN =
  /^COMMENT\s+ON\s+COLUMN\s+([\w".]+)\.(["\w]+)\s+IS\s+'((?:''|[^'])*)'\s*;$/i;

// node-sql-parser 丢弃表名的引号信息；在构造 AST 前完成未引用标识符的大小写折叠。
export function foldUnquotedPostgresIdentifiers(sql: string): string {
  return mapSqlCode(
    sql,
    (code) => code.replace(/[\p{L}_][\p{L}\p{N}_$]*/gu, (word) => word.toLowerCase()),
    { backslashEscapes: false },
  );
}

/**
 * Extract standalone COMMENT ON statements from PostgreSQL SQL
 *
 * Handles:
 * - COMMENT ON TABLE ... IS '...';
 * - COMMENT ON COLUMN ... IS '...';
 */
export function extractStandaloneComments(sql: string, options?: SqlScanOptions): PreprocessResult {
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

  const cleanedSql = splitSqlStatements(sql, options)
    .map((statement) => {
      const code = statement.replace(LEADING_SQL_TRIVIA, '');
      const table = code.match(TABLE_COMMENT_PATTERN);

      if (table) {
        getTableMetadata(table[1]).tableComment = unescapeComment(table[2]);

        return '';
      }

      const column = code.match(COLUMN_COMMENT_PATTERN);

      if (column) {
        getTableMetadata(column[1]).columnComments[column[2]] = unescapeComment(column[3]);

        return '';
      }

      return statement;
    })
    .join('');

  return { sql: cleanedSql, tableMetadata: Array.from(metadataByTable.values()) };
}
