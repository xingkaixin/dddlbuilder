import type { PreprocessResult } from './types.js';
import { mapDoubleQuotedSqlIdentifiers, mapSqlCode } from '../sqlSegments.js';

const DELIMITED_IDENTIFIER_PATTERN = String.raw`"(?:[^"]|"")*"`;
const IDENTIFIER_PATTERN = String.raw`(?:${DELIMITED_IDENTIFIER_PATTERN}|[\p{L}\p{N}_$#]+)`;
const QUALIFIED_IDENTIFIER_PATTERN = String.raw`${IDENTIFIER_PATTERN}(?:\s*\.\s*${IDENTIFIER_PATTERN})*`;
const TABLE_COMMENT_PATTERN = new RegExp(
  String.raw`\bCOMMENT\s+ON\s+TABLE\s+(${QUALIFIED_IDENTIFIER_PATTERN})\s+IS\s+'((?:''|[^'])*)'\s*;`,
  'giu',
);
const COLUMN_COMMENT_PATTERN = new RegExp(
  String.raw`\bCOMMENT\s+ON\s+COLUMN\s+(${QUALIFIED_IDENTIFIER_PATTERN})\s*\.\s*(${IDENTIFIER_PATTERN})\s+IS\s+'((?:''|[^'])*)'\s*;`,
  'giu',
);

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
  sql = sql.replace(TABLE_COMMENT_PATTERN, (_m, tableName, comment) => {
    getTableMetadata(tableName).tableComment = unescapeComment(comment);
    return '';
  });

  sql = sql.replace(COLUMN_COMMENT_PATTERN, (_m, tableName, column, comment) => {
    getTableMetadata(tableName).columnComments[column] = unescapeComment(comment);
    return '';
  });

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

  const identifierMappings = new Map<string, string>();
  let mappingIndex = 0;
  const parserSql = mapDoubleQuotedSqlIdentifiers(normalizedSql, (identifier) => {
    let placeholder = '';
    do {
      placeholder = `__ddlbuilder_oracle_identifier_${mappingIndex++}__`;
    } while (normalizedSql.includes(placeholder));
    identifierMappings.set(placeholder, identifier);
    return `\`${placeholder}\``;
  });

  return {
    sql: parserSql,
    tableMetadata: Array.from(metadataByTable.values()),
    identifierMappings,
  };
}
