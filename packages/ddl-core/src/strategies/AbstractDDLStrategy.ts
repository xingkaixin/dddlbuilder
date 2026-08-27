import type {
  NormalizedField,
  IndexDefinition,
  DatabaseType,
  SqlFormatMode,
  TableMiscConfig,
  ForeignKeyDefinition,
} from '@ddlbuilder/shared-types';
import type {
  ConfiguredTableDDL,
  DDLStrategy,
  TableFeatureConfig,
} from '../interfaces/DDLStrategy';
import { formatSqlTableName } from '../utils/databaseTypeMapping';
import { buildForeignKeyDDL } from '../utils/foreignKeys';
import { formatSqlIdentifier } from '../utils/sqlIdentifiers';
import { TypeMapper } from '../utils/TypeMapper';
import { buildPrimaryKeyName } from '../utils/primaryKeyNaming';
import { getIdentifierNameMaxLength, truncateIdentifierName } from '../utils/identifierNaming';
import { buildColumnComment } from './dialectComments';

export interface ColumnDefinitionSegments {
  name: string;
  body: string;
  comment?: string;
}

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
    return formatSqlTableName(tableName, this.getDatabaseType());
  }

  /**
   * 格式化字段名 - 所有数据库的通用实现
   */
  formatFieldName(fieldName: string): string {
    return formatSqlIdentifier(fieldName, this.getDatabaseType());
  }

  /**
   * 生成主键DDL的通用实现
   */
  protected generatePrimaryKeyDDL(tableName: string, index: IndexDefinition): string {
    const fieldList = index.fields.map((f) => this.formatFieldName(f.name)).join(', ');
    const maxLength = getIdentifierNameMaxLength(this.getDatabaseType());
    const constraintName = truncateIdentifierName(
      index.name.trim() || buildPrimaryKeyName(tableName, maxLength),
      maxLength,
    );

    return `ALTER TABLE ${this.formatTableName(tableName)} ADD CONSTRAINT ${this.formatFieldName(constraintName)} PRIMARY KEY (${fieldList});`;
  }

  /**
   * 生成索引字段列表的通用实现
   */
  protected formatIndexFieldList(index: IndexDefinition): string {
    return index.fields.map((f) => `${this.formatFieldName(f.name)} ${f.direction}`).join(', ');
  }

  /**
   * 生成标准索引DDL的通用实现
   */
  protected generateStandardIndexDDL(tableName: string, index: IndexDefinition): string {
    if (index.isPrimary) {
      return this.generatePrimaryKeyDDL(tableName, index);
    }
    if (index.isUniqueConstraint) {
      const fields = index.fields.map((field) => this.formatFieldName(field.name)).join(', ');
      return `ALTER TABLE ${this.formatTableName(tableName)} ADD CONSTRAINT ${this.formatFieldName(index.name)} UNIQUE (${fields});`;
    }

    const indexType = index.unique ? 'UNIQUE INDEX' : 'INDEX';
    const fieldList = this.formatIndexFieldList(index);
    const qualifiedName = this.formatTableName(tableName);

    return `CREATE ${indexType} ${this.formatFieldName(index.name)} ON ${qualifiedName} (${fieldList});`;
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
  protected generateColumnCommentsDDL(tableName: string, fields: NormalizedField[]): string[] {
    return fields
      .filter((field) => field.comment)
      .map((field) => buildColumnComment(tableName, field, this.getDatabaseType()));
  }

  protected renderColumnDefinitions(
    columns: ColumnDefinitionSegments[],
    sqlFormatMode: SqlFormatMode = 'compact',
  ): string[] {
    if (sqlFormatMode !== 'aligned' || columns.length === 0) {
      return columns.map(
        (column) => `  ${column.name} ${column.body}${column.comment ? ` ${column.comment}` : ''}`,
      );
    }

    const maxNameWidth = Math.max(...columns.map((column) => column.name.length));
    const maxBodyWidth = Math.max(...columns.map((column) => column.body.length));

    return columns.map((column) => {
      const name = column.name.padEnd(maxNameWidth);
      const body = column.comment ? column.body.padEnd(maxBodyWidth) : column.body;
      return `  ${name}  ${body}${column.comment ? `  ${column.comment}` : ''}`;
    });
  }

  /**
   * 子类必须实现的表DDL生成方法
   */
  abstract generateTableDDL(
    tableName: string,
    tableComment: string,
    fields: NormalizedField[],
    tableMiscConfig?: TableMiscConfig,
    sqlFormatMode?: SqlFormatMode,
    indexes?: IndexDefinition[],
  ): string;

  applyTableFeatures(
    _tableName: string,
    tableDDL: string,
    _config: TableFeatureConfig,
  ): ConfiguredTableDDL {
    return {
      tableDDL,
      trailingStatements: [],
    };
  }

  /**
   * 默认索引DDL生成实现，子类可以重写
   */
  generateIndexDDL(tableName: string, index: IndexDefinition): string {
    return this.generateStandardIndexDDL(tableName, index);
  }

  /**
   * 生成外键约束DDL的通用实现
   * 子类可以重写以适配方言差异
   */
  generateForeignKeyDDL(tableName: string, fk: ForeignKeyDefinition): string {
    return buildForeignKeyDDL(tableName, fk, this.getDatabaseType());
  }
}
