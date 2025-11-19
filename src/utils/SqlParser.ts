import { Parser } from "node-sql-parser";
import type { DatabaseType, NormalizedField, IndexDefinition, IndexField } from "../types";
import { v4 as uuidv4 } from 'uuid';

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

  parse(sql: string, dbType: DatabaseType): ParsedResult {
    const opt = {
      database: dbType === 'sqlserver' ? 'transactsql' : dbType,
    };

    let ast: any;
    try {
      ast = this.parser.astify(sql, opt);
    } catch (e) {
      console.error("SQL Parse Error:", e);
      throw new Error("无法解析 SQL，请检查语法或数据库类型是否正确。");
    }

    if (!Array.isArray(ast)) {
      ast = [ast];
    }

    const result: ParsedResult = {
      tableName: "",
      tableComment: "",
      fields: [],
      indexes: [],
      authObjects: [],
    };

    for (const stmt of ast) {
      if (stmt.type === 'create' && stmt.keyword === 'table') {
        this.parseCreateTable(stmt, result, dbType);
      } else if (stmt.type === 'create' && stmt.keyword === 'index') {
        this.parseCreateIndex(stmt, result);
      } else if (stmt.type === 'alter' && (!stmt.keyword || stmt.keyword === 'table')) {
        // Handle ALTER TABLE ADD INDEX / PRIMARY KEY if needed
        // node-sql-parser support for ALTER is limited, but we can try
        this.parseAlterTable(stmt, result);
      } else if (stmt.type === 'grant') {
        this.parseDCL(stmt, result);
      }
    }

    return result;
  }

  private parseCreateTable(stmt: any, result: ParsedResult, dbType: DatabaseType) {
    // 1. Table Name
    if (stmt.table && stmt.table.length > 0) {
      result.tableName = stmt.table[0].table;
    }

    // 2. Table Comment
    if (stmt.table_options) {
      const commentOpt = stmt.table_options.find((o: any) => o.keyword === 'comment');
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
             result.indexes.push({
                id: uuidv4(),
                name: 'PRIMARY',
                fields: [{ name: field.name, direction: 'ASC' }],
                unique: true,
                isPrimary: true
             });
          }
        } else if (def.resource === 'constraint') {
            if (def.constraint_type === 'primary key') {
                 const fields = def.definition.map((col: string) => ({ name: col, direction: 'ASC' }));
                 result.indexes.push({
                    id: uuidv4(),
                    name: 'PRIMARY',
                    fields: fields,
                    unique: true,
                    isPrimary: true
                 });
            } else if (def.constraint_type === 'unique key' || def.constraint_type === 'unique') {
                 const fields = def.definition.map((col: any) => ({ name: col.column || col, direction: 'ASC' }));
                 result.indexes.push({
                    id: uuidv4(),
                    name: def.constraint || `uk_${fields.map((f:any)=>f.name).join('_')}`,
                    fields: fields,
                    unique: true,
                    isPrimary: false
                 });
            }
        }
      });
    }
  }

  private mapColumnToField(colDef: any, _dbType: DatabaseType): NormalizedField {
    const name = colDef.column.column;
    
    // Type mapping
    let rawType = colDef.definition.dataType;
    if (colDef.definition.length) {
        rawType += `(${colDef.definition.length})`;
    } else if (colDef.definition.expr) {
        // Some dialects might put length in expr
    }

    // Reconstruct type string for our parser
    let typeStr = colDef.definition.dataType;
    if (colDef.definition.length) {
        typeStr += `(${colDef.definition.length})`;
    } else if (colDef.definition.suffix && Array.isArray(colDef.definition.suffix)) {
        // Handle (10, 2) etc
        typeStr += `(${colDef.definition.suffix.join(',')})`;
    }

    // Comment
    let comment = "";
    if (colDef.comment) {
        comment = colDef.comment.value.value.replace(/^'|'$/g, '');
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

    // Default
    let defaultKind: NormalizedField['defaultKind'] = 'none';
    let defaultValue = "";
    
    if (colDef.default_val) {
        const val = colDef.default_val.value;
        if (val && typeof val === 'object' && val.type === 'function') {
             let funcName = '';
             if (val.name && Array.isArray(val.name.name)) {
                 funcName = val.name.name[0].value;
             } else if (val.name && typeof val.name === 'string') {
                 funcName = val.name;
             }
             
             funcName = funcName.toLowerCase();

             if (['now', 'current_timestamp', 'sysdate'].includes(funcName)) {
                 defaultKind = 'current_timestamp';
             } else if (funcName === 'uuid') {
                 defaultKind = 'uuid';
             } else {
                 defaultKind = 'constant';
                 defaultValue = funcName ? `${funcName}()` : String(val); // Fallback
             }
        } else {
             defaultKind = 'constant';
             if (val && typeof val === 'object' && val.value !== undefined) {
                 defaultValue = String(val.value).replace(/^'|'$/g, '');
             } else {
                 defaultValue = String(val).replace(/^'|'$/g, '');
             }
        }
    }
    
    // Auto Increment
    if (colDef.auto_increment) {
        defaultKind = 'auto_increment';
    }

    // On Update
    let onUpdate: NormalizedField['onUpdate'] = 'none';
    if (colDef.on_update) {
        const val = colDef.on_update.value;
        if (val && typeof val === 'object' && val.type === 'function') {
             let funcName = '';
             if (val.name && Array.isArray(val.name.name)) {
                 funcName = val.name.name[0].value;
             } else if (val.name && typeof val.name === 'string') {
                 funcName = val.name;
             }
             funcName = funcName.toLowerCase();

             if (['now', 'current_timestamp', 'sysdate'].includes(funcName)) {
                 onUpdate = 'current_timestamp';
             }
        }
    }

    return {
      name,
      type: typeStr,
      comment,
      nullable,
      defaultKind,
      defaultValue,
      onUpdate
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

      const fields: IndexField[] = columns.map((col: any) => ({
          name: col.column,
          direction: col.order_by ? col.order_by.toUpperCase() : 'ASC'
      }));

      result.indexes.push({
          id: uuidv4(),
          name: indexName,
          fields,
          unique: stmt.index_type === 'unique' || stmt.keyword === 'unique',
          isPrimary: false
      });
  }

  private parseAlterTable(stmt: any, result: ParsedResult) {
      // Basic support for ALTER TABLE ADD PRIMARY KEY / INDEX
      if (!stmt.expr || !Array.isArray(stmt.expr)) return;

      stmt.expr.forEach((expr: any) => {
          const defs = expr.create_definitions;
          if (expr.action === 'add' && defs) {
              if (defs.constraint_type === 'primary key') {
                   const fields = defs.definition.map((col: any) => ({ 
                       name: col.column || col, 
                       direction: 'ASC' 
                   }));
                   result.indexes.push({
                        id: uuidv4(),
                        name: 'PRIMARY',
                        fields: fields,
                        unique: true,
                        isPrimary: true
                     });
              }
          } else if (expr.action === 'add' && expr.resource === 'constraint' && expr.constraint_type === 'primary key') {
               // Fallback for other AST structure
               const fields = expr.definition.map((col: string) => ({ name: col, direction: 'ASC' }));
               result.indexes.push({
                    id: uuidv4(),
                    name: 'PRIMARY',
                    fields: fields,
                    unique: true,
                    isPrimary: true
                 });
          }
      });
  }

  private parseDCL(stmt: any, result: ParsedResult) {
      // Handle GRANT statements
      // Example: GRANT SELECT ON table TO user
      const users = stmt.user_or_roles || stmt.to;
      if (users && Array.isArray(users)) {
          users.forEach((user: any) => {
              const userName = user.name ? user.name.value : (user.user || String(user));
              if (userName && !result.authObjects.includes(userName)) {
                  result.authObjects.push(userName);
              }
          });
      }
  }
}
