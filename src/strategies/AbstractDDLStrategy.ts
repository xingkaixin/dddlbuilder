import type { NormalizedField, IndexDefinition, DatabaseType } from "../types";
import type { DDLStrategy } from "../interfaces/DDLStrategy";
import {
  escapeSingleQuotes,
  splitQualifiedName,
} from "../utils/databaseTypeMapping";
import { TypeMapper } from "../utils/TypeMapper";

/**
 * DDL策略抽象基类
 * 提供所有策略类的公共实现，减少代码重复
 */
export abstract class AbstractDDLStrategy implements DDLStrategy {
  /**
   * 子类必须实现的数据库类型方法
   */
  abstract getDatabaseType(): DatabaseType;

  /**
   * 格式化表名 - 所有数据库的通用实现
   */
  formatTableName(tableName: string): string {
    const parts = splitQualifiedName(tableName);
    if (parts.length === 0) {
      return tableName.trim();
    }
    return parts.join(".");
  }

  /**
   * 格式化字段名 - 所有数据库的通用实现
   */
  formatFieldName(fieldName: string): string {
    return fieldName;
  }

  /**
   * 生成主键DDL的通用实现
   */
  protected generatePrimaryKeyDDL(
    tableName: string,
    index: IndexDefinition,
  ): string {
    const fieldList = index.fields.map((f) => f.name).join(", ");
    return `ALTER TABLE ${this.formatTableName(tableName)} ADD PRIMARY KEY (${fieldList});`;
  }

  /**
   * 生成索引字段列表的通用实现
   */
  protected formatIndexFieldList(index: IndexDefinition): string {
    return index.fields.map((f) => `${f.name} ${f.direction}`).join(", ");
  }

  /**
   * 生成标准索引DDL的通用实现
   */
  protected generateStandardIndexDDL(
    tableName: string,
    index: IndexDefinition,
  ): string {
    if (index.isPrimary) {
      return this.generatePrimaryKeyDDL(tableName, index);
    }

    const indexType = index.unique ? "UNIQUE INDEX" : "INDEX";
    const fieldList = this.formatIndexFieldList(index);
    const qualifiedName = this.formatTableName(tableName);

    return `CREATE ${indexType} ${index.name} ON ${qualifiedName} (${fieldList});`;
  }

  /**
   * 创建TypeMapper实例的通用方法
   */
  protected createTypeMapper(): TypeMapper {
    return TypeMapper.create(this.getDatabaseType());
  }

  /**
   * 生成列注释DDL的通用实现（用于支持列注释的数据库）
   */
  protected generateColumnCommentsDDL(
    tableName: string,
    fields: NormalizedField[],
  ): string[] {
    const statements: string[] = [];
    const qualifiedTableName = this.formatTableName(tableName);

    fields
      .filter((field) => field.comment)
      .forEach((field) => {
        statements.push(
          `COMMENT ON COLUMN ${qualifiedTableName}.${this.formatFieldName(
            field.name,
          )} IS '${escapeSingleQuotes(field.comment)}';`,
        );
      });

    return statements;
  }

  /**
   * 子类必须实现的表DDL生成方法
   */
  abstract generateTableDDL(
    tableName: string,
    tableComment: string,
    fields: NormalizedField[],
  ): string;

  /**
   * 默认索引DDL生成实现，子类可以重写
   */
  generateIndexDDL(
    tableName: string,
    index: IndexDefinition,
    // fields: NormalizedField[],
  ): string {
    return this.generateStandardIndexDDL(tableName, index);
  }
}
