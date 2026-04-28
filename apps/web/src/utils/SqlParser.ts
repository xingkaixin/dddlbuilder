import type { DatabaseType } from '@ddlbuilder/shared-types';
import {
  preprocessOracle,
  preprocessSqlServer,
  extractSqlServerGrantUsers,
  extractStandaloneComments,
  type PreprocessResult,
} from './preprocessors/index.js';
import { reportError } from './errorReporter.js';
import {
  parseCreateIndex,
  parseCreateTable,
  parseAlterTable,
  parseDCL,
  parseTransactGrant,
} from './sql-parser/astHandlers.js';
import { loadParserConstructor } from './sql-parser/parserLoader.js';
import { preprocessMysql } from './sql-parser/preprocessMysql.js';
import type { ParsedResult, ParserInstance, MultiParsedResult } from './sql-parser/types.js';

export type { ParsedResult } from './sql-parser/types.js';

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
    extractedComments: {
      tableComment: string;
      columnComments: Record<string, string>;
    } | null;
    rawGrantUsers: string[];
    extractedPartitionConfig: ParsedResult['mysqlPartitionConfig'];
  } {
    let sqlToParse = sql;
    let extractedComments: {
      tableComment: string;
      columnComments: Record<string, string>;
    } | null = null;
    let rawGrantUsers: string[] = [];
    let extractedPartitionConfig: ParsedResult['mysqlPartitionConfig'];

    const mergeCommentSource = (source: PreprocessResult | null) => {
      if (!source) return;
      if (!extractedComments) {
        extractedComments = {
          tableComment: source.tableComment,
          columnComments: { ...source.columnComments },
        };
        return;
      }
      if (source.tableComment && !extractedComments.tableComment) {
        extractedComments.tableComment = source.tableComment;
      }
      for (const key of Object.keys(source.columnComments)) {
        if (!extractedComments.columnComments[key]) {
          extractedComments.columnComments[key] = source.columnComments[key];
        }
      }
    };

    if (dbType === 'oracle') {
      const processed = preprocessOracle(sqlToParse);
      sqlToParse = processed.sql;
      mergeCommentSource(processed);
    }

    if (dbType === 'sqlserver') {
      const processed = preprocessSqlServer(sqlToParse);
      sqlToParse = processed.sql;
      mergeCommentSource(processed);
      rawGrantUsers = extractSqlServerGrantUsers(sql);
    }

    if (['mysql', 'mariadb', 'tidb', 'oceanbase'].includes(dbType)) {
      const processed = preprocessMysql(sqlToParse);
      sqlToParse = processed.sql;
      extractedPartitionConfig = processed.partitionConfig;
      if (processed.tableComment || Object.keys(processed.columnComments).length > 0) {
        mergeCommentSource(processed);
      }
    }

    const standalone = extractStandaloneComments(sqlToParse);
    sqlToParse = standalone.sql;
    mergeCommentSource(standalone);

    return { sqlToParse, extractedComments, rawGrantUsers, extractedPartitionConfig };
  }

  private buildAstifyOpt(dbType: DatabaseType) {
    return {
      database:
        dbType === 'sqlserver'
          ? 'transactsql'
          : dbType === 'oracle'
            ? 'mysql'
            : dbType === 'postgresql-citus'
              ? 'postgresql'
              : dbType,
    };
  }

  private applyPostParseMetadata(
    result: ParsedResult,
    dbType: DatabaseType,
    extractedComments: {
      tableComment: string;
      columnComments: Record<string, string>;
    } | null,
    rawGrantUsers: string[],
    extractedPartitionConfig: ParsedResult['mysqlPartitionConfig'],
  ) {
    if (extractedComments) {
      this.mergeComments(result, extractedComments.tableComment, extractedComments.columnComments);
    }

    if (dbType === 'sqlserver' && result.authObjects.length === 0 && rawGrantUsers.length > 0) {
      rawGrantUsers.forEach((u) => {
        if (!result.authObjects.includes(u)) {
          result.authObjects.push(u);
        }
      });
    }

    if (extractedPartitionConfig) {
      result.mysqlPartitionConfig = extractedPartitionConfig;
    }
  }

  private parseWithParser(parser: ParserInstance, sql: string, dbType: DatabaseType): ParsedResult {
    const { sqlToParse, extractedComments, rawGrantUsers, extractedPartitionConfig } =
      this.preprocessSql(sql, dbType);

    const opt = this.buildAstifyOpt(dbType);

    let ast: any;
    try {
      ast = parser.astify(sqlToParse, opt);
    } catch (e) {
      reportError(e, {
        scope: 'SqlParser',
        action: 'astify',
        metadata: { dbType },
      });
      throw new Error('无法解析 SQL，请检查语法或数据库类型是否正确。');
    }

    if (!Array.isArray(ast)) {
      ast = [ast];
    }

    const result: ParsedResult = {
      tableName: '',
      tableComment: '',
      fields: [],
      indexes: [],
      foreignKeys: [],
      authObjects: [],
    };

    for (const stmt of ast) {
      if (stmt.type === 'create' && stmt.keyword === 'table') {
        parseCreateTable(stmt, result, dbType);
      } else if (stmt.type === 'create' && stmt.keyword === 'index') {
        parseCreateIndex(stmt, result);
      } else if (stmt.type === 'alter' && (!stmt.keyword || stmt.keyword === 'table')) {
        parseAlterTable(stmt, result);
      } else if (stmt.type === 'grant') {
        parseDCL(stmt, result);
      } else if (dbType === 'sqlserver') {
        parseTransactGrant(stmt, result);
      }
    }

    this.applyPostParseMetadata(
      result,
      dbType,
      extractedComments,
      rawGrantUsers,
      extractedPartitionConfig,
    );

    return result;
  }

  private parseMultiWithParser(
    parser: ParserInstance,
    sql: string,
    dbType: DatabaseType,
  ): MultiParsedResult {
    const { sqlToParse, extractedComments, rawGrantUsers, extractedPartitionConfig } =
      this.preprocessSql(sql, dbType);

    const opt = this.buildAstifyOpt(dbType);

    let ast: any;
    try {
      ast = parser.astify(sqlToParse, opt);
    } catch (e) {
      reportError(e, {
        scope: 'SqlParser',
        action: 'astify-multi',
        metadata: { dbType },
      });
      throw new Error('无法解析 SQL，请检查语法或数据库类型是否正确。');
    }

    if (!ast) {
      return { results: [], failed: [] };
    }

    if (!Array.isArray(ast)) {
      ast = [ast];
    }

    // Collect all extracted comments info for per-table matching
    const globalColumnComments = extractedComments?.columnComments ?? {};
    const globalTableComment = extractedComments?.tableComment ?? '';

    // Phase 1: Create a ParsedResult for each CREATE TABLE
    const tableMap = new Map<string, ParsedResult>();
    const results: ParsedResult[] = [];
    const failed: Array<{ statement: string; error: string }> = [];

    for (const stmt of ast) {
      if (stmt.type === 'create' && stmt.keyword === 'table') {
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
          tableMap.set(tableResult.tableName, tableResult);
          results.push(tableResult);
        }
      }
    }

    if (results.length === 0) {
      return { results: [], failed };
    }

    // Phase 2: Associate CREATE INDEX / ALTER TABLE / GRANT to matching tables
    for (const stmt of ast) {
      if (stmt.type === 'create' && stmt.keyword === 'index') {
        const indexTableName = stmt.table?.table;
        const targetResult = indexTableName ? tableMap.get(indexTableName) : undefined;
        if (targetResult) {
          parseCreateIndex(stmt, targetResult, indexTableName);
        }
      } else if (stmt.type === 'alter' && (!stmt.keyword || stmt.keyword === 'table')) {
        const alterTableName = stmt.table?.[0]?.table;
        const targetResult = alterTableName ? tableMap.get(alterTableName) : undefined;
        if (targetResult) {
          parseAlterTable(stmt, targetResult, alterTableName);
        }
      } else if (stmt.type === 'grant') {
        for (const result of results) {
          parseDCL(stmt, result);
        }
      } else if (dbType === 'sqlserver') {
        for (const result of results) {
          parseTransactGrant(stmt, result);
        }
      }
    }

    // Phase 3: Merge extracted comments and partition config per table
    for (const result of results) {
      // Try to match table-specific comments. If the global extracted comment
      // was from standalone comments or per-table preprocessors, we apply it.
      // For multi-table, standalone comments are global; per-table processors
      // (Oracle/SQLServer/MySQL) may extract the first table's info.
      // We apply global comments to all tables as a best-effort baseline.
      if (globalTableComment || Object.keys(globalColumnComments).length > 0) {
        this.mergeComments(result, globalTableComment, globalColumnComments);
      }
    }

    if (rawGrantUsers.length > 0) {
      for (const result of results) {
        if (result.authObjects.length === 0) {
          rawGrantUsers.forEach((u) => {
            if (!result.authObjects.includes(u)) {
              result.authObjects.push(u);
            }
          });
        }
      }
    }

    if (extractedPartitionConfig) {
      // For multi-table, partition config is typically global in the script.
      // Apply to all MySQL-family tables as best effort.
      for (const result of results) {
        result.mysqlPartitionConfig = extractedPartitionConfig;
      }
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
