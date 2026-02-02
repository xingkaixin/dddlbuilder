import { Parser } from 'node-sql-parser';
import type {
  DatabaseType,
  NormalizedField,
  IndexDefinition,
  IndexField,
} from '../types';
import { v4 as uuidv4 } from 'uuid';
import { buildPrimaryKeyName } from './primaryKeyNaming';
import {
  preprocessOracle,
  preprocessSqlServer,
  extractSqlServerGrantUsers,
  extractStandaloneComments,
  type PreprocessResult,
} from './preprocessors';

interface PreprocessMySqlResult {
  sql: string;
  indexes: string[];
  tableComment: string;
  columnComments: Record<string, string>;
}

function preprocessMysql(sql: string): PreprocessMySqlResult {
  const result: PreprocessMySqlResult = {
    sql,
    indexes: [],
    tableComment: '',
    columnComments: {},
  };

  const hasPartition = /\bPARTITION\s+BY\b/i.test(sql);
  if (!hasPartition) {
    return result;
  }

  const lines = sql.split('\n');
  const cleanedLines: string[] = [];
  let parenthesesDepth = 0;
  let inTableDefinition = false;
  let foundCreateTable = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim().toUpperCase();

    if (trimmedLine.startsWith('CREATE TABLE')) {
      foundCreateTable = true;
      inTableDefinition = true;
      cleanedLines.push(line);
      continue;
    }

    if (foundCreateTable && inTableDefinition) {
      // 检查这一行是否包含闭合括号（表定义的结束）
      let lineToAdd = line;
      let hasClosingParen = false;

      for (const char of line) {
        if (char === '(') {
          parenthesesDepth++;
        } else if (char === ')') {
          parenthesesDepth--;
          if (parenthesesDepth === 0) {
            hasClosingParen = true;
          }
        }
      }

      if (hasClosingParen) {
        // 找到闭合括号，只保留到右括号为止的内容
        const parenIndex = line.lastIndexOf(')');
        if (parenIndex !== -1) {
          lineToAdd = line.substring(0, parenIndex + 1);
        }
        cleanedLines.push(lineToAdd);
        inTableDefinition = false;
      } else {
        cleanedLines.push(line);
      }
    }
  }

  let cleanedSql = cleanedLines.join('\n').trim();
  if (!cleanedSql) {
    return result;
  }

  // 确保 SQL 以分号结尾
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

  const standaloneIndexRegex =
    /CREATE\s+(UNIQUE\s+)?INDEX\s+(\w+)\s+ON\s+\w+\s*\(([^;]+)\);?/gi;
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

export type ParsedResult = {
  tableName: string;
  tableComment: string;
  fields: NormalizedField[];
  indexes: IndexDefinition[];
  authObjects: string[];
};

export class SqlParser {
  private parser: Parser;

  constructor() {
    this.parser = new Parser();
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

  private normalizeColumnName(column: any): string {
    if (column === undefined || column === null) return '';
    if (typeof column === 'string') return column;
    if (typeof column === 'object') {
      if (column.column !== undefined) {
        return this.normalizeColumnName(column.column);
      }
      if (column.expr && column.expr.value !== undefined) {
        return this.normalizeColumnName(column.expr.value);
      }
      if (column.value !== undefined) {
        return this.normalizeColumnName(column.value);
      }
    }
    return String(column);
  }

  private buildTypeString(definition: any): string {
    const baseType = definition?.dataType || '';
    const length = definition?.length;
    const scale = definition?.scale;
    const normalizedScale =
      scale === null || scale === undefined || scale === 'null'
        ? undefined
        : scale;

    if (length && normalizedScale !== undefined) {
      return `${baseType}(${length},${normalizedScale})`;
    }
    if (length) {
      return `${baseType}(${length})`;
    }
    if (Array.isArray(definition?.suffix) && definition.suffix.length > 0) {
      const suffixValues = definition.suffix.filter(
        (v: any) =>
          v !== null && v !== undefined && String(v).toLowerCase() !== 'null',
      );
      if (suffixValues.length > 0) {
        return `${baseType}(${suffixValues.join(',')})`;
      }
      return baseType;
    }
    return baseType;
  }

  private extractFunctionName(val: any): string | null {
    if (!val) return null;
    if (val.keyword) {
      return String(val.keyword).toLowerCase();
    }
    if (val.type === 'function' && val.name) {
      if (Array.isArray(val.name.name) && val.name.name[0]) {
        const nameNode = val.name.name[0];
        const rawName =
          nameNode?.value ?? nameNode?.expr?.value ?? val.name.name[0];
        return rawName ? String(rawName).toLowerCase() : null;
      }
      if (typeof val.name === 'string') {
        return val.name.toLowerCase();
      }
    }
    if (typeof val === 'string') {
      return val.toLowerCase();
    }
    return null;
  }

  private normalizeLiteral(val: any): string {
    if (val === undefined || val === null) return '';
    if (typeof val === 'object') {
      if (val.value !== undefined) {
        return this.normalizeLiteral(val.value);
      }
      if (val.expr !== undefined) {
        return this.normalizeLiteral(val.expr);
      }
    }
    return String(val).replace(/^'|'$/g, '');
  }

  private buildIndexFields(columns: any[]): IndexField[] {
    if (!Array.isArray(columns)) return [];

    return columns
      .map((col: any) => {
        const name = this.normalizeColumnName(col?.column ?? col);
        if (!name) return null;
        const direction =
          col?.order_by || col?.order_by_expr || col?.order
            ? String(col.order_by || col.order_by_expr || col.order)
                .toUpperCase()
                .includes('DESC')
              ? 'DESC'
              : 'ASC'
            : 'ASC';
        return { name, direction } as IndexField;
      })
      .filter(Boolean) as IndexField[];
  }

  private pushIndex(
    result: ParsedResult,
    name: string,
    fields: IndexField[],
    unique: boolean,
    isPrimary = false,
  ) {
    if (fields.length === 0) return;
    const baseName = result.tableName || name;
    const normalizedName = isPrimary ? buildPrimaryKeyName(baseName) : name;
    result.indexes.push({
      id: uuidv4(),
      name: normalizedName,
      fields,
      unique,
      isPrimary,
    });
  }

  private enforceNotNullForFields(result: ParsedResult, fieldNames: string[]) {
    if (!fieldNames.length) return;
    result.fields = result.fields.map((f) =>
      fieldNames.includes(f.name) ? { ...f, nullable: false } : f,
    );
  }

  parse(sql: string, dbType: DatabaseType): ParsedResult {
    let sqlToParse = sql;
    let extractedComments: {
      tableComment: string;
      columnComments: Record<string, string>;
    } | null = null;
    let rawGrantUsers: string[] = [];

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
      if (
        processed.tableComment ||
        Object.keys(processed.columnComments).length > 0
      ) {
        if (!extractedComments) {
          extractedComments = {
            tableComment: processed.tableComment,
            columnComments: processed.columnComments,
          };
        } else {
          if (processed.tableComment && !extractedComments.tableComment) {
            extractedComments.tableComment = processed.tableComment;
          }
          for (const key of Object.keys(processed.columnComments)) {
            if (!extractedComments.columnComments[key]) {
              extractedComments.columnComments[key] =
                processed.columnComments[key];
            }
          }
        }
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
      ast = this.parser.astify(sqlToParse, opt);
    } catch (e) {
      console.error('SQL Parse Error:', e);
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
        this.parseCreateTable(stmt, result, dbType);
      } else if (stmt.type === 'create' && stmt.keyword === 'index') {
        this.parseCreateIndex(stmt, result);
      } else if (
        stmt.type === 'alter' &&
        (!stmt.keyword || stmt.keyword === 'table')
      ) {
        this.parseAlterTable(stmt, result);
      } else if (stmt.type === 'grant') {
        this.parseDCL(stmt, result);
      } else if (dbType === 'sqlserver') {
        this.parseTransactGrant(stmt, result);
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

    return result;
  }

  private parseCreateTable(
    stmt: any,
    result: ParsedResult,
    dbType: DatabaseType,
  ) {
    // 1. Table Name
    if (stmt.table && stmt.table.length > 0) {
      result.tableName = stmt.table[0].table;
    }

    // 2. Table Comment
    if (stmt.table_options) {
      const commentOpt = stmt.table_options.find(
        (o: any) => o.keyword === 'comment',
      );
      if (commentOpt) {
        result.tableComment = commentOpt.value.replace(/^'|'$/g, '');
      }
    }

    // 3. Columns & Inline Indexes
    if (stmt.create_definitions) {
      stmt.create_definitions.forEach((def: any) => {
        if (def.resource === 'column') {
          const field = this.mapColumnToField(def, dbType);
          result.fields.push(field);

          // Handle inline primary key / unique
          if (def.primary_key) {
            this.pushIndex(
              result,
              'PRIMARY',
              [{ name: field.name, direction: 'ASC' }],
              true,
              true,
            );
            this.enforceNotNullForFields(result, [field.name]);
          }

          if (def.unique) {
            this.pushIndex(
              result,
              `uk_${field.name}`,
              [{ name: field.name, direction: 'ASC' }],
              true,
              false,
            );
          }
        } else if (def.resource === 'constraint') {
          if (def.constraint_type === 'primary key') {
            const fields = this.buildIndexFields(def.definition || []);
            this.pushIndex(result, 'PRIMARY', fields, true, true);
            this.enforceNotNullForFields(
              result,
              fields.map((f) => f.name),
            );
          } else if (
            def.constraint_type === 'unique key' ||
            def.constraint_type === 'unique'
          ) {
            const fields = this.buildIndexFields(def.definition || []);
            const indexName =
              def.constraint ||
              def.index ||
              `uk_${fields.map((f: any) => f.name).join('_')}`;
            this.pushIndex(result, indexName, fields, true, false);
          }
        } else if (def.resource === 'index') {
          const fields = this.buildIndexFields(def.definition || []);
          this.pushIndex(
            result,
            def.index,
            fields,
            def.index_type === 'unique' || def.keyword === 'unique',
            false,
          );
        }
      });
    }
  }

  private mapColumnToField(
    colDef: any,
    _dbType: DatabaseType,
  ): NormalizedField {
    const name = this.normalizeColumnName(colDef.column);
    const typeStr = this.buildTypeString(colDef.definition);

    // Comment
    let comment = '';
    if (colDef.comment) {
      comment = this.normalizeLiteral(colDef.comment.value.value);
    }

    // Nullable
    let nullable = true;
    if (colDef.nullable) {
      if (colDef.nullable.value === 'not null') {
        nullable = false;
      } else if (colDef.nullable.value === 'null') {
        nullable = true;
      }
    }
    if (colDef.primary_key) {
      nullable = false;
    }

    // Default
    let defaultKind: NormalizedField['defaultKind'] = 'none';
    let defaultValue = '';

    if (colDef.default_val) {
      const val = colDef.default_val.value;
      const funcName = this.extractFunctionName(val);

      if (funcName) {
        if (['now', 'current_timestamp', 'sysdate'].includes(funcName)) {
          defaultKind = 'current_timestamp';
        } else if (funcName === 'uuid') {
          defaultKind = 'uuid';
        } else {
          defaultKind = 'constant';
          defaultValue = `${funcName}()`;
        }
      } else {
        defaultKind = 'constant';
        defaultValue = this.normalizeLiteral(val);
      }
    }

    // Auto Increment
    if (colDef.auto_increment) {
      defaultKind = 'auto_increment';
      defaultValue = '';
    }

    // On Update
    let onUpdate: NormalizedField['onUpdate'] = 'none';
    const onUpdateSource =
      colDef.on_update?.value ||
      colDef.on_update ||
      (colDef.default_val?.value && typeof colDef.default_val.value === 'object'
        ? colDef.default_val.value.over
        : undefined);
    const onUpdateFuncName = this.extractFunctionName(onUpdateSource);
    if (
      onUpdateFuncName &&
      ['now', 'current_timestamp', 'sysdate'].includes(onUpdateFuncName)
    ) {
      onUpdate = 'current_timestamp';
    }

    return {
      name,
      type: typeStr,
      comment,
      nullable,
      defaultKind,
      defaultValue,
      onUpdate,
    };
  }

  private parseCreateIndex(stmt: any, result: ParsedResult) {
    const indexName = stmt.index;
    const tableName = stmt.table.table;

    // Only process if table name matches (simple validation)
    if (result.tableName && tableName !== result.tableName) {
      return;
    }

    const columns = stmt.index_columns || stmt.columns;
    if (!columns || !Array.isArray(columns)) {
      return;
    }

    const fields: IndexField[] = this.buildIndexFields(columns);

    this.pushIndex(
      result,
      indexName,
      fields,
      stmt.index_type === 'unique' || stmt.keyword === 'unique',
      false,
    );
  }

  private parseAlterTable(stmt: any, result: ParsedResult) {
    // Basic support for ALTER TABLE ADD PRIMARY KEY / INDEX
    if (!stmt.expr || !Array.isArray(stmt.expr)) return;

    stmt.expr.forEach((expr: any) => {
      const defs = expr.create_definitions;
      if (expr.action === 'add' && defs) {
        if (defs.constraint_type === 'primary key') {
          const fields = this.buildIndexFields(defs.definition || []);
          this.pushIndex(result, 'PRIMARY', fields, true, true);
          this.enforceNotNullForFields(
            result,
            fields.map((f) => f.name),
          );
        }
      } else if (
        expr.action === 'add' &&
        expr.resource === 'constraint' &&
        expr.constraint_type === 'primary key'
      ) {
        // Fallback for other AST structure
        const fields = this.buildIndexFields(expr.definition || []);
        this.pushIndex(result, 'PRIMARY', fields, true, true);
        this.enforceNotNullForFields(
          result,
          fields.map((f) => f.name),
        );
      }
    });
  }

  private parseDCL(stmt: any, result: ParsedResult) {
    // Handle GRANT statements
    // Example: GRANT SELECT ON table TO user
    const users = stmt.user_or_roles || stmt.to;
    if (users && Array.isArray(users)) {
      users.forEach((user: any) => {
        const userName = user.name
          ? user.name.value
          : user.user || String(user);
        if (userName && !result.authObjects.includes(userName)) {
          result.authObjects.push(userName);
        }
      });
    }
  }

  private parseTransactGrant(stmt: any, result: ParsedResult) {
    if (!Array.isArray(stmt)) return;
    const toPart = stmt.find((s: any) => s?.stmt?.left?.name === 'TO');
    const nameNode = toPart?.stmt?.right?.name?.[0];
    const value = nameNode?.value ?? nameNode;
    const userName = value ? String(value) : '';
    if (userName && !result.authObjects.includes(userName)) {
      result.authObjects.push(userName);
    }
  }
}
