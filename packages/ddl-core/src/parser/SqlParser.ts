import { splitSqlStatements } from './sqlSegments.js';
import type { DatabaseType } from '@ddlbuilder/shared-types';
import {
  preprocessOracle,
  preprocessSqlServer,
  extractStandaloneComments,
  foldUnquotedPostgresIdentifiers,
  type PreprocessResult,
  type PreprocessedTableMetadata,
} from './preprocessors/index.js';
import { parseCreateIndex, parseCreateTable, parseAlterTable } from './astHandlers.js';
import {
  isAlterTableStmt,
  isCreateIndexStmt,
  isCreateTableStmt,
  type AstStatement,
  type TableRefNode,
} from './astTypes.js';
import { loadParserConstructor } from './parserLoader.js';
import { preprocessMysql } from './preprocessMysql.js';
import type { ParsedResult, ParserInstance, MultiParsedResult } from './types.js';
import { getDatabaseFamily, getSqlParserDialect } from '../utils/databaseFamily.js';

export type { ParsedResult } from './types.js';

type ScopedGrant = {
  tableName: string;
  users: string[];
};

const normalizeIdentifier = (name: string, dbType: DatabaseType) => {
  const unquoted = name
    .trim()
    .replace(/^([`"[])(.*)[`"\]]$/, '$2')
    .replaceAll('""', '"')
    .replaceAll('``', '`')
    .replaceAll(']]', ']');
  return getDatabaseFamily(dbType) === 'postgresql' ? unquoted : unquoted.toLowerCase();
};

const tableKey = (table: string, schema: string, dbType: DatabaseType) =>
  JSON.stringify([normalizeIdentifier(schema, dbType), normalizeIdentifier(table, dbType)]);

const parseTableReference = (name: string, dbType: DatabaseType): TableRefNode => {
  const parts = name.match(/"(?:[^"]|"")*"|`(?:[^`]|``)*`|\[(?:[^\]]|\]\])*\]|[^.\s]+/g) ?? [];
  return {
    table: parts.at(-1) ?? '',
    schema: parts
      .slice(0, -1)
      .map((part) => normalizeIdentifier(part, dbType))
      .join('.'),
  };
};

const referenceKey = ({ table, schema, db }: TableRefNode, dbType: DatabaseType) =>
  tableKey(table, db || schema || '', dbType);

const createTableResolver = (results: ParsedResult[], dbType: DatabaseType) => {
  const qualified = new Map<string, ParsedResult>();
  const unqualified = new Map<string, ParsedResult | null>();
  for (const result of results) {
    qualified.set(tableKey(result.tableName, result.schemaName ?? '', dbType), result);
    const name = normalizeIdentifier(result.tableName, dbType);
    unqualified.set(name, unqualified.has(name) ? null : result);
  }
  return (reference: TableRefNode) =>
    qualified.get(referenceKey(reference, dbType)) ??
    (!(reference.db || reference.schema)
      ? unqualified.get(normalizeIdentifier(reference.table, dbType))
      : undefined);
};

const cleanGrantUser = (value: string) =>
  value
    .trim()
    .replace(/^N'/i, "'")
    .replaceAll('`', '')
    .replaceAll('"', '')
    .replaceAll("'", '')
    .replaceAll('[', '')
    .replaceAll(']', '');

const extractScopedGrants = (sql: string): ScopedGrant[] => {
  const grants: ScopedGrant[] = [];
  const grantRegex = /\bGRANT\b[\s\S]*?\bON\s+(?:TABLE\s+)?([`"[\]\w.*]+)\s+\bTO\s+([^;]+)/gi;
  for (const match of sql.matchAll(grantRegex)) {
    const users = match[2].split(',').map(cleanGrantUser).filter(Boolean);
    if (users.length > 0) grants.push({ tableName: match[1], users });
  }
  return grants;
};

export class SqlParser {
  private parser: ParserInstance | null;

  constructor(parser?: ParserInstance) {
    this.parser = parser ?? null;
  }

  private async getParser(): Promise<ParserInstance> {
    if (!this.parser) {
      const Parser = await loadParserConstructor();
      this.parser = new Parser();
    }
    return this.parser;
  }

  private mergeComments(
    result: ParsedResult,
    tableComment: string,
    columnComments: Record<string, string>,
  ) {
    if (tableComment && !result.tableComment) {
      result.tableComment = tableComment;
    }
    result.fields = result.fields.map((f) => ({
      ...f,
      comment: columnComments[f.name] ?? f.comment,
    }));
  }

  private preprocessSql(
    sql: string,
    dbType: DatabaseType,
  ): {
    sqlToParse: string;
    tableMetadata: Map<string, PreprocessedTableMetadata>;
    grants: ScopedGrant[];
    partitionConfigs: Map<string, NonNullable<ParsedResult['mysqlPartitionConfig']>>;
  } {
    const databaseFamily = getDatabaseFamily(dbType);
    const normalizedSql =
      databaseFamily === 'postgresql' ? foldUnquotedPostgresIdentifiers(sql) : sql;
    let sqlToParse = normalizedSql;
    const tableMetadata = new Map<string, PreprocessedTableMetadata>();
    const partitionConfigs = new Map<string, NonNullable<ParsedResult['mysqlPartitionConfig']>>();

    const mergeCommentSource = (source: PreprocessResult | null) => {
      if (!source) return;
      for (const metadata of source.tableMetadata) {
        const key = referenceKey(parseTableReference(metadata.tableName, dbType), dbType);
        const existing = tableMetadata.get(key);
        if (!existing) {
          tableMetadata.set(key, {
            ...metadata,
            columnComments: { ...metadata.columnComments },
          });
          continue;
        }
        if (metadata.tableComment && !existing.tableComment) {
          existing.tableComment = metadata.tableComment;
        }
        for (const [columnName, comment] of Object.entries(metadata.columnComments)) {
          if (!existing.columnComments[columnName]) existing.columnComments[columnName] = comment;
        }
      }
    };

    if (databaseFamily === 'oracle' || databaseFamily === 'dm') {
      const processed = preprocessOracle(sqlToParse);
      sqlToParse = processed.sql;
      mergeCommentSource(processed);
    }

    if (dbType === 'sqlserver') {
      const processed = preprocessSqlServer(sqlToParse);
      sqlToParse = processed.sql;
      mergeCommentSource(processed);
    }

    if (databaseFamily === 'mysql') {
      const processed = preprocessMysql(sqlToParse);
      sqlToParse = processed.sql;
      mergeCommentSource(processed);
      for (const [tableName, config] of Object.entries(processed.partitionConfigs)) {
        partitionConfigs.set(tableName, config);
      }
    }

    const standalone = extractStandaloneComments(sqlToParse);
    sqlToParse = standalone.sql;
    mergeCommentSource(standalone);

    return {
      sqlToParse,
      tableMetadata,
      grants: extractScopedGrants(normalizedSql),
      partitionConfigs,
    };
  }

  private buildAstifyOpt(dbType: DatabaseType) {
    return {
      database: getSqlParserDialect(dbType),
    };
  }

  private completeTables(
    results: ParsedResult[],
    statements: AstStatement[],
    tableMetadata: Map<string, PreprocessedTableMetadata>,
    grants: ScopedGrant[],
    partitionConfigs: Map<string, NonNullable<ParsedResult['mysqlPartitionConfig']>>,
    dbType: DatabaseType,
  ) {
    const resolveTable = createTableResolver(results, dbType);
    const emptyResult = results.length === 1 && !results[0].tableName ? results[0] : undefined;
    for (const stmt of statements) {
      if (isCreateIndexStmt(stmt)) {
        const target = resolveTable(stmt.table) ?? emptyResult;
        if (target) parseCreateIndex(stmt, target, stmt.table.table);
      } else if (isAlterTableStmt(stmt)) {
        const reference = Array.isArray(stmt.table) ? stmt.table[0] : stmt.table;
        const target = reference ? (resolveTable(reference) ?? emptyResult) : emptyResult;
        if (target) parseAlterTable(stmt, target, reference?.table);
      }
    }

    for (const metadata of tableMetadata.values()) {
      const result =
        resolveTable(parseTableReference(metadata.tableName, dbType)) ??
        (tableMetadata.size === 1 ? emptyResult : undefined);
      if (result) this.mergeComments(result, metadata.tableComment, metadata.columnComments);
    }
    for (const grant of grants) {
      const result =
        resolveTable(parseTableReference(grant.tableName, dbType)) ??
        (grants.length === 1 ? emptyResult : undefined);
      if (!result) continue;
      for (const user of grant.users) {
        if (!result.authObjects.includes(user)) result.authObjects.push(user);
      }
    }

    for (const [name, config] of partitionConfigs) {
      const result = resolveTable(parseTableReference(name, dbType));
      if (result) result.mysqlPartitionConfig = config;
    }
  }

  private parseWithParser(parser: ParserInstance, sql: string, dbType: DatabaseType): ParsedResult {
    const { sqlToParse, tableMetadata, grants, partitionConfigs } = this.preprocessSql(sql, dbType);

    const opt = this.buildAstifyOpt(dbType);

    let ast: AstStatement | AstStatement[];
    try {
      ast = parser.astify(sqlToParse, opt);
    } catch {
      throw new Error('无法解析 SQL，请检查语法或数据库类型是否正确。');
    }

    const statements = Array.isArray(ast) ? ast : [ast];
    if (statements.filter(isCreateTableStmt).length > 1) {
      throw new Error('检测到多个 CREATE TABLE，请使用 parseMultiAsync() 方法。');
    }

    const result: ParsedResult = {
      tableName: '',
      tableComment: '',
      fields: [],
      indexes: [],
      foreignKeys: [],
      authObjects: [],
    };

    for (const stmt of statements) {
      if (isCreateTableStmt(stmt)) {
        parseCreateTable(stmt, result, (value) => parser.exprToSQL(value, opt));
      }
    }

    this.completeTables([result], statements, tableMetadata, grants, partitionConfigs, dbType);

    return result;
  }

  private parseMultiWithParser(
    parser: ParserInstance,
    sql: string,
    dbType: DatabaseType,
  ): MultiParsedResult {
    const { tableMetadata, grants, partitionConfigs } = this.preprocessSql(sql, dbType);
    const opt = this.buildAstifyOpt(dbType);
    const statements: AstStatement[] = [];
    const results: ParsedResult[] = [];
    const failed: MultiParsedResult['failed'] = [];

    for (const original of splitSqlStatements(sql, {
      backslashEscapes: getDatabaseFamily(dbType) !== 'postgresql',
    })) {
      try {
        const { sqlToParse } = this.preprocessSql(original, dbType);
        if (!sqlToParse.trim()) continue;
        const ast = parser.astify(sqlToParse, opt);
        if (!ast) continue;
        const parsed = Array.isArray(ast) ? ast : [ast];
        statements.push(...parsed);
        for (const stmt of parsed) {
          if (!isCreateTableStmt(stmt)) continue;
          const tableResult: ParsedResult = {
            tableName: '',
            tableComment: '',
            fields: [],
            indexes: [],
            foreignKeys: [],
            authObjects: [],
          };
          parseCreateTable(stmt, tableResult, (value) => parser.exprToSQL(value, opt));
          if (tableResult.tableName) results.push(tableResult);
        }
      } catch (error) {
        failed.push({
          statement: original.trim(),
          error: error instanceof Error ? error.message : '解析失败',
        });
      }
    }
    if (results.length > 0) {
      this.completeTables(results, statements, tableMetadata, grants, partitionConfigs, dbType);
    }
    return { results, failed };
  }

  parse(sql: string, dbType: DatabaseType): ParsedResult {
    if (!this.parser) {
      throw new Error('SqlParser尚未初始化，请使用 parseAsync() 方法。');
    }
    return this.parseWithParser(this.parser, sql, dbType);
  }

  async parseAsync(sql: string, dbType: DatabaseType): Promise<ParsedResult> {
    const parser = await this.getParser();
    return this.parseWithParser(parser, sql, dbType);
  }

  async parseMultiAsync(sql: string, dbType: DatabaseType): Promise<MultiParsedResult> {
    const parser = await this.getParser();
    return this.parseMultiWithParser(parser, sql, dbType);
  }
}
