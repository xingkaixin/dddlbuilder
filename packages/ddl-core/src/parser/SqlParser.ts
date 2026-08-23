import type { DatabaseType } from '@ddlbuilder/shared-types';
import {
  preprocessOracle,
  preprocessSqlServer,
  extractStandaloneComments,
  type PreprocessResult,
  type PreprocessedTableMetadata,
} from './preprocessors/index.js';
import { parseCreateIndex, parseCreateTable, parseAlterTable } from './astHandlers.js';
import {
  isAlterTableStmt,
  isCreateIndexStmt,
  isCreateTableStmt,
  type AstStatement,
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

const normalizeTableName = (tableName: string) =>
  tableName
    .split('.')
    .at(-1)
    ?.replaceAll('`', '')
    .replaceAll('"', '')
    .replaceAll('[', '')
    .replaceAll(']', '')
    .toLowerCase() ?? '';

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
    let sqlToParse = sql;
    const tableMetadata = new Map<string, PreprocessedTableMetadata>();
    const partitionConfigs = new Map<string, NonNullable<ParsedResult['mysqlPartitionConfig']>>();

    const mergeCommentSource = (source: PreprocessResult | null) => {
      if (!source) return;
      for (const metadata of source.tableMetadata) {
        const key = normalizeTableName(metadata.tableName);
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

    const databaseFamily = getDatabaseFamily(dbType);

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
        partitionConfigs.set(normalizeTableName(tableName), config);
      }
    }

    const standalone = extractStandaloneComments(sqlToParse);
    sqlToParse = standalone.sql;
    mergeCommentSource(standalone);

    return {
      sqlToParse,
      tableMetadata,
      grants: extractScopedGrants(sql),
      partitionConfigs,
    };
  }

  private buildAstifyOpt(dbType: DatabaseType) {
    return {
      database: getSqlParserDialect(dbType),
    };
  }

  private applyPostParseMetadata(
    result: ParsedResult,
    tableMetadata: Map<string, PreprocessedTableMetadata>,
    grants: ScopedGrant[],
    partitionConfigs: Map<string, NonNullable<ParsedResult['mysqlPartitionConfig']>>,
  ) {
    const tableKey = normalizeTableName(result.tableName);
    const metadata =
      tableMetadata.get(tableKey) ??
      (tableMetadata.size === 1 && !tableKey ? tableMetadata.values().next().value : undefined);
    if (metadata) {
      this.mergeComments(result, metadata.tableComment, metadata.columnComments);
    }

    const matchingGrants = grants.filter(
      (grant) =>
        normalizeTableName(grant.tableName) === tableKey || (!tableKey && grants.length === 1),
    );
    for (const grant of matchingGrants) {
      for (const user of grant.users) {
        if (!result.authObjects.includes(user)) result.authObjects.push(user);
      }
    }

    const partitionConfig = partitionConfigs.get(tableKey);
    if (partitionConfig) result.mysqlPartitionConfig = partitionConfig;
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
        parseCreateTable(stmt, result, dbType);
      } else if (isCreateIndexStmt(stmt)) {
        parseCreateIndex(stmt, result);
      } else if (isAlterTableStmt(stmt)) {
        parseAlterTable(stmt, result);
      }
    }

    this.applyPostParseMetadata(result, tableMetadata, grants, partitionConfigs);

    return result;
  }

  private parseMultiWithParser(
    parser: ParserInstance,
    sql: string,
    dbType: DatabaseType,
  ): MultiParsedResult {
    const { sqlToParse, tableMetadata, grants, partitionConfigs } = this.preprocessSql(sql, dbType);

    const opt = this.buildAstifyOpt(dbType);

    let ast: AstStatement | AstStatement[];
    try {
      ast = parser.astify(sqlToParse, opt);
    } catch {
      throw new Error('无法解析 SQL，请检查语法或数据库类型是否正确。');
    }

    if (!ast) {
      return { results: [], failed: [] };
    }

    const statements = Array.isArray(ast) ? ast : [ast];

    const tableMap = new Map<string, ParsedResult>();
    const results: ParsedResult[] = [];
    const failed: Array<{ statement: string; error: string }> = [];

    for (const stmt of statements) {
      if (isCreateTableStmt(stmt)) {
        const tableResult: ParsedResult = {
          tableName: '',
          tableComment: '',
          fields: [],
          indexes: [],
          foreignKeys: [],
          authObjects: [],
        };
        try {
          parseCreateTable(stmt, tableResult, dbType);
        } catch (err) {
          const stmtText = typeof stmt === 'object' ? JSON.stringify(stmt) : String(stmt);
          failed.push({
            statement: stmtText.slice(0, 500),
            error: err instanceof Error ? err.message : '解析失败',
          });
          continue;
        }
        if (tableResult.tableName) {
          tableMap.set(normalizeTableName(tableResult.tableName), tableResult);
          results.push(tableResult);
        }
      }
    }

    if (results.length === 0) {
      return { results: [], failed };
    }

    for (const stmt of statements) {
      if (isCreateIndexStmt(stmt)) {
        const indexTableName = stmt.table?.table;
        const targetResult = indexTableName
          ? tableMap.get(normalizeTableName(indexTableName))
          : undefined;
        if (targetResult) {
          parseCreateIndex(stmt, targetResult, indexTableName);
        }
      } else if (isAlterTableStmt(stmt)) {
        const tableNode = Array.isArray(stmt.table) ? stmt.table[0] : stmt.table;
        const alterTableName = tableNode?.table;
        const targetResult = alterTableName
          ? tableMap.get(normalizeTableName(alterTableName))
          : undefined;
        if (targetResult) {
          parseAlterTable(stmt, targetResult, alterTableName);
        }
      }
    }

    for (const result of results) {
      this.applyPostParseMetadata(result, tableMetadata, grants, partitionConfigs);
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
