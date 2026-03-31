import type { MysqlPartitionConfig } from '../../types/index.js';
import { PARTITION_BY_REGEX, extractPartitionConfig } from './partitionParser.js';
import { stripPartitionClauses } from './partitionStripper.js';

export interface PreprocessMySqlResult {
  sql: string;
  indexes: string[];
  tableComment: string;
  columnComments: Record<string, string>;
  partitionConfig?: MysqlPartitionConfig;
}

export function preprocessMysql(sql: string): PreprocessMySqlResult {
  const result: PreprocessMySqlResult = {
    sql,
    indexes: [],
    tableComment: '',
    columnComments: {},
    partitionConfig: undefined,
  };

  const hasPartition = PARTITION_BY_REGEX.test(sql);
  if (!hasPartition || !/\bCREATE\s+TABLE\b/i.test(sql)) {
    return result;
  }

  result.partitionConfig = extractPartitionConfig(sql);

  let cleanedSql = stripPartitionClauses(sql).trim();
  if (!cleanedSql) {
    return result;
  }

  if (!cleanedSql.endsWith(';')) {
    cleanedSql += ';';
  }

  const tableCommentMatch = cleanedSql.match(/COMMENT\s*=\s*['"]([^'"]*)['"]/i);
  if (tableCommentMatch) {
    result.tableComment = tableCommentMatch[1];
  }

  const columnCommentRegex =
    /(\w+)\s+[\w()]+(?:\([^)]*\))?\s*(?:NULL|NOT NULL)?\s*(?:DEFAULT\s*[^,]*)?\s*(?:COMMENT\s*['"]([^'"]*)['"])?/gi;
  const columnMatches = [...cleanedSql.matchAll(columnCommentRegex)];
  for (const match of columnMatches) {
    if (match[2]) {
      result.columnComments[match[1]] = match[2];
    }
  }

  const standaloneIndexRegex = /CREATE\s+(UNIQUE\s+)?INDEX\s+(\w+)\s+ON\s+\w+\s*\(([^;]+)\);?/gi;
  const standaloneMatches = [...sql.matchAll(standaloneIndexRegex)];
  for (const match of standaloneMatches) {
    result.indexes.push(match[0]);
  }

  const alterIndexRegex =
    /ALTER\s+TABLE\s+\w+\s+ADD\s+(PRIMARY\s+KEY|UNIQUE\s+\w+|INDEX\s+\w+|CONSTRAINT\s+\w+\s+(PRIMARY\s+KEY|UNIQUE\s+\w+))?\s*\(([^;]+)\);?/gi;
  const alterMatches = [...sql.matchAll(alterIndexRegex)];
  for (const match of alterMatches) {
    result.indexes.push(match[0]);
  }

  result.sql = cleanedSql;
  return result;
}
