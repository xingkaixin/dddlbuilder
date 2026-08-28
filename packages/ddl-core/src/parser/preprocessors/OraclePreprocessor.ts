import type { PreprocessResult } from './types.js';
import { mapSqlCode } from '../sqlSegments.js';

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

  // Extract and remove COMMENT statements
  sql = sql.replace(
    /COMMENT\s+ON\s+TABLE\s+([\w".]+)\s+IS\s+'((?:''|[^'])*)'\s*;/gi,
    (_m, tableName, comment) => {
      getTableMetadata(tableName).tableComment = unescapeComment(comment);
      return '';
    },
  );

  sql = sql.replace(
    /COMMENT\s+ON\s+COLUMN\s+([\w".]+)\.(["\w]+)\s+IS\s+'((?:''|[^'])*)'\s*;/gi,
    (_m, tableName, column, comment) => {
      const colName = column.replace(/"/g, '');
      getTableMetadata(tableName).columnComments[colName] = unescapeComment(comment);
      return '';
    },
  );

  // Remove synonym creation statements
  sql = sql.replace(/CREATE\s+OR\s+REPLACE\s+PUBLIC\s+SYNONYM[\s\S]*?;/gi, '');

  // Normalize types and default values for parser compatibility
  const normalizedSql = mapSqlCode(sql, (code) =>
    code
      .replace(/\bVARCHAR2\b/gi, 'VARCHAR')
      .replace(/\bNUMBER\(\s*(\d+)\s*,\s*null\s*\)/gi, 'DECIMAL($1)')
      .replace(/\bNUMBER\(\s*(\d+)\s*,\s*(\d+)\s*\)/gi, 'DECIMAL($1,$2)')
      .replace(/\bNUMBER\(\s*(\d+)\s*\)/gi, 'DECIMAL($1)')
      .replace(/\bNUMBER\b/gi, 'DECIMAL')
      .replace(/\bDEFAULT\s+SYS_GUID\(\)/gi, 'DEFAULT uuid()')
      .replace(/\bDEFAULT\s+SYSTIMESTAMP\b/gi, 'DEFAULT CURRENT_TIMESTAMP'),
  );

  return { sql: normalizedSql, tableMetadata: Array.from(metadataByTable.values()) };
}
