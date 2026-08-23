import type { PreprocessResult } from './types.js';

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
