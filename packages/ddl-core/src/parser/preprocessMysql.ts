import type { MysqlPartitionConfig } from '@ddlbuilder/shared-types';
import { PARTITION_BY_REGEX, extractPartitionConfig } from './partitionParser.js';
import type { PreprocessedTableMetadata } from './preprocessors/types.js';

export interface PreprocessMySqlResult {
  sql: string;
  tableMetadata: PreprocessedTableMetadata[];
  partitionConfigs: Record<string, MysqlPartitionConfig>;
}

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let quote = '';

  for (let index = 0; index < sql.length; index++) {
    const char = sql[index];
    const escaped = index > 0 && sql[index - 1] === '\\';
    if (!escaped && (char === "'" || char === '"' || char === '`')) {
      quote = quote === char ? '' : quote || char;
    }
    current += char;
    if (char === ';' && !quote) {
      statements.push(current);
      current = '';
    }
  }

  if (current.trim()) statements.push(current);
  return statements;
}

function extractTableName(sql: string) {
  const match = sql.match(/\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([`"\w.]+)/i);
  return match?.[1] ?? '';
}

function extractTableMetadata(sql: string, tableName: string): PreprocessedTableMetadata {
  const tableCommentMatch = sql.match(/COMMENT\s*=\s*['"]([^'"]*)['"]/i);
  const columnComments: Record<string, string> = {};
  const columnCommentRegex =
    /([`"\w]+)\s+[\w()]+(?:\([^)]*\))?\s*(?:NULL|NOT NULL)?\s*(?:DEFAULT\s*[^,]*)?\s*(?:COMMENT\s*['"]([^'"]*)['"])?/gi;
  for (const match of sql.matchAll(columnCommentRegex)) {
    if (match[2]) columnComments[match[1].replace(/[`"]+/g, '')] = match[2];
  }
  return {
    tableName,
    tableComment: tableCommentMatch?.[1] ?? '',
    columnComments,
  };
}

export function preprocessMysql(sql: string): PreprocessMySqlResult {
  const result: PreprocessMySqlResult = {
    sql,
    tableMetadata: [],
    partitionConfigs: {},
  };

  const hasPartition = PARTITION_BY_REGEX.test(sql);
  if (!hasPartition || !/\bCREATE\s+TABLE\b/i.test(sql)) {
    return result;
  }

  const statements = splitSqlStatements(sql);
  for (const statement of statements) {
    const tableName = extractTableName(statement);
    if (!tableName || !PARTITION_BY_REGEX.test(statement)) continue;
    const partitionConfig = extractPartitionConfig(statement);
    if (partitionConfig) result.partitionConfigs[tableName] = partitionConfig;
    result.tableMetadata.push(extractTableMetadata(statement, tableName));
  }

  let cleanedSql = statements
    .map((statement) => {
      if (!extractTableName(statement)) return statement;
      const partitionMatch = PARTITION_BY_REGEX.exec(statement);
      if (!partitionMatch) return statement;
      return `${statement.slice(0, partitionMatch.index).trimEnd()};`;
    })
    .join('\n')
    .trim();
  if (!cleanedSql) {
    return result;
  }

  if (!cleanedSql.endsWith(';')) {
    cleanedSql += ';';
  }

  result.sql = cleanedSql;
  return result;
}
