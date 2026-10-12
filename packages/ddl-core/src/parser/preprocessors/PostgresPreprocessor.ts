import {
  LEADING_SQL_TRIVIA,
  mapSqlCode,
  splitSqlStatements,
  type SqlScanOptions,
} from '../sqlSegments.js';
import type { PreprocessResult } from './types.js';

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

// node-sql-parser 把 character(n) 解析成 character varying(n)，也不认识 bpchar(n)；两者都等同 char(n)。
// 关键字后的同名表引用不是类型。
const CHAR_TYPE_ALIAS =
  /(?<!\b(?:table|exists|references|on|into)\s+)(?<![\p{L}\p{N}_$.])(?:character|bpchar)(?=\s*\()/giu;

export function normalizePostgresCharTypes(sql: string): string {
  return mapSqlCode(sql, (code) => code.replace(CHAR_TYPE_ALIAS, 'char'), {
    backslashEscapes: false,
  });
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
