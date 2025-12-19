import type { PreprocessResult } from './types';

/**
 * Preprocess Oracle SQL for parsing
 *
 * Handles:
 * - Extract and remove COMMENT ON TABLE/COLUMN statements
 * - Remove CREATE OR REPLACE PUBLIC SYNONYM statements
 * - Normalize Oracle types (VARCHAR2 → VARCHAR, NUMBER → DECIMAL)
 * - Convert SYS_GUID() → uuid(), SYSTIMESTAMP → CURRENT_TIMESTAMP
 */
export function preprocessOracle(sql: string): PreprocessResult {
  const columnComments: Record<string, string> = {};
  let tableComment = '';
  const unescapeComment = (value: string) => value.replace(/''/g, "'");

  // Extract and remove COMMENT statements
  sql = sql.replace(
    /COMMENT\s+ON\s+TABLE\s+[\w".]+\s+IS\s+'((?:''|[^'])*)'\s*;/gi,
    (_m, comment) => {
      tableComment = unescapeComment(comment);
      return '';
    },
  );

  sql = sql.replace(
    /COMMENT\s+ON\s+COLUMN\s+[\w".]+\.(["\w]+)\s+IS\s+'((?:''|[^'])*)'\s*;/gi,
    (_m, column, comment) => {
      const colName = column.replace(/"/g, '');
      columnComments[colName] = unescapeComment(comment);
      return '';
    },
  );

  // Remove synonym creation statements
  sql = sql.replace(/CREATE\s+OR\s+REPLACE\s+PUBLIC\s+SYNONYM[\s\S]*?;/gi, '');

  // Normalize types and default values for parser compatibility
  const normalizedSql = sql
    .replace(/VARCHAR2/gi, 'VARCHAR')
    .replace(/NUMBER\(\s*(\d+)\s*,\s*null\s*\)/gi, 'DECIMAL($1)')
    .replace(/NUMBER\(\s*(\d+)\s*,\s*(\d+)\s*\)/gi, 'DECIMAL($1,$2)')
    .replace(/NUMBER\(\s*(\d+)\s*\)/gi, 'DECIMAL($1)')
    .replace(/\bNUMBER\b/gi, 'DECIMAL')
    .replace(/DEFAULT\s+SYS_GUID\(\)/gi, 'DEFAULT uuid()')
    .replace(/DEFAULT\s+SYSTIMESTAMP/gi, 'DEFAULT CURRENT_TIMESTAMP');

  return { sql: normalizedSql, tableComment, columnComments };
}
