import type { PreprocessResult } from './types';

/**
 * Extract standalone COMMENT ON statements from PostgreSQL SQL
 *
 * Handles:
 * - COMMENT ON TABLE ... IS '...';
 * - COMMENT ON COLUMN ... IS '...';
 */
export function extractStandaloneComments(sql: string): PreprocessResult {
  const columnComments: Record<string, string> = {};
  let tableComment = '';

  const cleanedSql = sql
    .replace(
      /COMMENT\s+ON\s+TABLE\s+[\w".]+\s+IS\s+'([^']*)'\s*;/gi,
      (_m, comment) => {
        tableComment = comment;
        return '';
      },
    )
    .replace(
      /COMMENT\s+ON\s+COLUMN\s+[\w".]+\.(["\w]+)\s+IS\s+'([^']*)'\s*;/gi,
      (_m, column, comment) => {
        const colName = column.replace(/"/g, '');
        columnComments[colName] = comment;
        return '';
      },
    );

  return { sql: cleanedSql, tableComment, columnComments };
}
