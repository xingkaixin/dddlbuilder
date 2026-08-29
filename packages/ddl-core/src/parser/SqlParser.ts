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
import { getSqlIdentifierKey } from '../utils/sqlIdentifiers.js';
import { SqlParseError } from './SqlParseError.js';

export type { ParsedResult } from './types.js';

type ScopedGrant = {
  tableName: string;
  users: string[];
};

type ParserSyntaxError = Error & {
  expected: unknown[];
  found: unknown;
  location: {
    start: { offset: number };
    end: { offset: number };
  };
};

const isParserSyntaxError = (error: unknown): error is ParserSyntaxError => {
  if (!(error instanceof Error) || error.name !== 'SyntaxError') return false;
  const candidate = error as Partial<ParserSyntaxError>;
  return (
    Array.isArray(candidate.expected) &&
    'found' in error &&
    typeof candidate.location?.start?.offset === 'number' &&
    typeof candidate.location?.end?.offset === 'number'
  );
};

const normalizeIdentifier = (name: string, dbType: DatabaseType) =>
  getSqlIdentifierKey(name, dbType);

const SQL_IDENTIFIER_PATTERN =
  '(?:"(?:[^"]|"")*"|`(?:[^`]|``)*`|\\[(?:[^\\]]|\\]\\])*\\]|[\\p{L}\\p{N}_$#*]+)';
const QUALIFIED_SQL_IDENTIFIER_PATTERN = `${SQL_IDENTIFIER_PATTERN}(?:\\s*\\.\\s*${SQL_IDENTIFIER_PATTERN})*`;

const restoreIdentifierMappings = (value: unknown, mappings: ReadonlyMap<string, string>): void => {
  if (!value || typeof value !== 'object' || mappings.size === 0) return;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      const item = value[index];
      if (typeof item === 'string') value[index] = mappings.get(item) ?? item;
      else restoreIdentifierMappings(item, mappings);
    }
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'string') {
      const restored = mappings.get(item);
      if (restored !== undefined) (value as Record<string, unknown>)[key] = restored;
    } else {
      restoreIdentifierMappings(item, mappings);
    }
  }
};

const protectExpressionIdentifiers = (
  value: unknown,
  placeholdersByIdentifier: ReadonlyMap<string, string>,
): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => protectExpressionIdentifiers(item, placeholdersByIdentifier));
  }
  if (!value || typeof value !== 'object') return value;
  const source = value as Record<string, unknown>;
  const protectedValue = Object.fromEntries(
    Object.entries(source).map(([key, item]) => [
      key,
      protectExpressionIdentifiers(item, placeholdersByIdentifier),
    ]),
  );
  if (source.type === 'column_ref') {
    for (const key of ['table', 'column']) {
      const identifier = source[key];
      if (typeof identifier === 'string') {
        protectedValue[key] = placeholdersByIdentifier.get(identifier) ?? identifier;
      }
    }
  }
  return protectedValue;
};

const createExpressionSerializer = (
  parser: ParserInstance,
  opt: { database: string },
  mappings: ReadonlyMap<string, string>,
) => {
  if (mappings.size === 0) return (value: unknown) => parser.exprToSQL(value, opt);
  const placeholdersByIdentifier = new Map<string, string>();
  for (const [placeholder, identifier] of mappings) {
    if (!placeholdersByIdentifier.has(identifier)) {
      placeholdersByIdentifier.set(identifier, placeholder);
    }
  }
  return (value: unknown) => {
    const protectedValue = protectExpressionIdentifiers(value, placeholdersByIdentifier);
    let sql = parser.exprToSQL(protectedValue, opt);
    for (const [placeholder, identifier] of mappings) {
      sql = sql.replaceAll(`\`${placeholder}\``, identifier).replaceAll(placeholder, identifier);
    }
    return sql;
  };
};

const tableKey = (table: string, schema: string, dbType: DatabaseType) =>
  JSON.stringify([normalizeIdentifier(schema, dbType), normalizeIdentifier(table, dbType)]);

const parseTableReference = (name: string): TableRefNode => {
  const parts = name.match(new RegExp(SQL_IDENTIFIER_PATTERN, 'gu')) ?? [];
  return {
    table: parts.at(-1) ?? '',
    schema: parts.slice(0, -1).join('.'),
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
  const grantRegex = new RegExp(
    `\\bGRANT\\b[\\s\\S]*?\\bON\\s+(?:TABLE\\s+)?(${QUALIFIED_SQL_IDENTIFIER_PATTERN})\\s+\\bTO\\s+([^;]+)`,
    'giu',
  );
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
    dbType: DatabaseType,
  ) {
    if (tableComment && !result.tableComment) {
      result.tableComment = tableComment;
    }
    const commentsByIdentifier = new Map(
      Object.entries(columnComments).map(([name, comment]) => [
        normalizeIdentifier(name, dbType),
        comment,
      ]),
    );
    result.fields = result.fields.map((field) => ({
      ...field,
      comment: commentsByIdentifier.get(normalizeIdentifier(field.name, dbType)) ?? field.comment,
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
    identifierMappings: ReadonlyMap<string, string>;
  } {
    const databaseFamily = getDatabaseFamily(dbType);
    const normalizedSql =
      databaseFamily === 'postgresql' ? foldUnquotedPostgresIdentifiers(sql) : sql;
    let sqlToParse = normalizedSql;
    const tableMetadata = new Map<string, PreprocessedTableMetadata>();
    const partitionConfigs = new Map<string, NonNullable<ParsedResult['mysqlPartitionConfig']>>();
    const identifierMappings = new Map<string, string>();

    const mergeCommentSource = (source: PreprocessResult | null) => {
      if (!source) return;
      for (const metadata of source.tableMetadata) {
        const key = referenceKey(parseTableReference(metadata.tableName), dbType);
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
      for (const [placeholder, identifier] of source.identifierMappings ?? []) {
        identifierMappings.set(placeholder, identifier);
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
      identifierMappings,
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
        resolveTable(parseTableReference(metadata.tableName)) ??
        (tableMetadata.size === 1 ? emptyResult : undefined);
      if (result)
        this.mergeComments(result, metadata.tableComment, metadata.columnComments, dbType);
    }
    for (const grant of grants) {
      const result =
        resolveTable(parseTableReference(grant.tableName)) ??
        (grants.length === 1 ? emptyResult : undefined);
      if (!result) continue;
      for (const user of grant.users) {
        if (!result.authObjects.includes(user)) result.authObjects.push(user);
      }
    }

    for (const [name, config] of partitionConfigs) {
      const result = resolveTable(parseTableReference(name));
      if (result) result.mysqlPartitionConfig = config;
    }
  }

  private parseWithParser(parser: ParserInstance, sql: string, dbType: DatabaseType): ParsedResult {
    const { sqlToParse, tableMetadata, grants, partitionConfigs, identifierMappings } =
      this.preprocessSql(sql, dbType);

    const opt = this.buildAstifyOpt(dbType);

    const ast = this.astify(parser, sqlToParse, opt);
    restoreIdentifierMappings(ast, identifierMappings);
    const serializeExpression = createExpressionSerializer(parser, opt, identifierMappings);

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
        parseCreateTable(stmt, result, serializeExpression);
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
        const { sqlToParse, identifierMappings } = this.preprocessSql(original, dbType);
        if (!sqlToParse.trim()) continue;
        const ast = this.astify(parser, sqlToParse, opt);
        restoreIdentifierMappings(ast, identifierMappings);
        const serializeExpression = createExpressionSerializer(parser, opt, identifierMappings);
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
          parseCreateTable(stmt, tableResult, serializeExpression);
          if (tableResult.tableName) results.push(tableResult);
        }
      } catch (error) {
        if (!(error instanceof SqlParseError)) throw error;
        failed.push({
          statement: original.trim(),
          error: error.parserMessage,
        });
      }
    }
    if (results.length > 0) {
      this.completeTables(results, statements, tableMetadata, grants, partitionConfigs, dbType);
    }
    return { results, failed };
  }

  private astify(
    parser: ParserInstance,
    sql: string,
    opt: { database: string },
  ): AstStatement | AstStatement[] {
    try {
      return parser.astify(sql, opt);
    } catch (error) {
      if (!isParserSyntaxError(error)) throw error;
      throw new SqlParseError(error.message, error);
    }
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
