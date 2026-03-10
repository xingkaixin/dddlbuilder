import type { DatabaseType } from '../types/index.js';
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
import type { ParsedResult, ParserInstance } from './sql-parser/types.js';

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

  private parseWithParser(
    parser: ParserInstance,
    sql: string,
    dbType: DatabaseType,
  ): ParsedResult {
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
      if (
        processed.tableComment ||
        Object.keys(processed.columnComments).length > 0
      ) {
        mergeCommentSource(processed);
      }
    }

    const standalone = extractStandaloneComments(sqlToParse);
    sqlToParse = standalone.sql;
    mergeCommentSource(standalone);

    const opt = {
      database:
        dbType === 'sqlserver'
          ? 'transactsql'
          : dbType === 'oracle'
            ? 'mysql'
            : dbType === 'postgresql-citus'
              ? 'postgresql'
              : dbType,
    };

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
      authObjects: [],
    };

    for (const stmt of ast) {
      if (stmt.type === 'create' && stmt.keyword === 'table') {
        parseCreateTable(stmt, result, dbType);
      } else if (stmt.type === 'create' && stmt.keyword === 'index') {
        parseCreateIndex(stmt, result);
      } else if (
        stmt.type === 'alter' &&
        (!stmt.keyword || stmt.keyword === 'table')
      ) {
        parseAlterTable(stmt, result);
      } else if (stmt.type === 'grant') {
        parseDCL(stmt, result);
      } else if (dbType === 'sqlserver') {
        parseTransactGrant(stmt, result);
      }
    }

    if (extractedComments) {
      this.mergeComments(
        result,
        extractedComments.tableComment,
        extractedComments.columnComments,
      );
    }

    if (
      dbType === 'sqlserver' &&
      result.authObjects.length === 0 &&
      rawGrantUsers.length > 0
    ) {
      rawGrantUsers.forEach((u) => {
        if (!result.authObjects.includes(u)) {
          result.authObjects.push(u);
        }
      });
    }

    if (extractedPartitionConfig) {
      result.mysqlPartitionConfig = extractedPartitionConfig;
    }

    return result;
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
}
