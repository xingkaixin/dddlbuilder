import { mapSqlCode } from '../sqlSegments.js';
import type { PreprocessResult } from './types.js';

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
        getTableMetadata(tableName).columnComments[column] = unescapeComment(comment);
        return '';
      },
    );

  return { sql: cleanedSql, tableMetadata: Array.from(metadataByTable.values()) };
}
