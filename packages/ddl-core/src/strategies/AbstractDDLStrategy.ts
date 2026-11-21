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
import { resolveIndexName } from '../utils/primaryKeyNaming';
import { buildColumnComment } from './dialectComments';

export interface ColumnDefinitionSegments {
  name: string;
  body: string;
  comment?: string;
}

export abstract class AbstractDDLStrategy implements DDLStrategy {
  abstract getDatabaseType(): DatabaseType;

  formatTableName(tableName: string): string {
    return formatSqlTableName(tableName, this.getDatabaseType());
  }

  formatFieldName(fieldName: string): string {
    return formatSqlIdentifier(fieldName, this.getDatabaseType());
  }

  protected generatePrimaryKeyDDL(tableName: string, index: IndexDefinition): string {
    const fieldList = index.fields.map((f) => this.formatFieldName(f.name)).join(', ');
    const constraintName = resolveIndexName(tableName, index, this.getDatabaseType());

    return `ALTER TABLE ${this.formatTableName(tableName)} ADD CONSTRAINT ${this.formatFieldName(constraintName)} PRIMARY KEY (${fieldList});`;
  }

  protected formatIndexFieldList(index: IndexDefinition): string {
    return index.fields.map((f) => `${this.formatFieldName(f.name)} ${f.direction}`).join(', ');
  }

  protected generateStandardIndexDDL(tableName: string, index: IndexDefinition): string {
    if (index.kind === 'primary') {
      return this.generatePrimaryKeyDDL(tableName, index);
    }

    if (index.kind === 'unique_constraint') {
      const fields = index.fields.map((field) => this.formatFieldName(field.name)).join(', ');

      return `ALTER TABLE ${this.formatTableName(tableName)} ADD CONSTRAINT ${this.formatFieldName(index.name)} UNIQUE (${fields});`;
    }

    const indexType = index.kind !== 'index' ? 'UNIQUE INDEX' : 'INDEX';
    const fieldList = this.formatIndexFieldList(index);
    const qualifiedName = this.formatTableName(tableName);

    return `CREATE ${indexType} ${this.formatFieldName(index.name)} ON ${qualifiedName} (${fieldList});`;
  }

  protected createTypeMapper(): TypeMapper {
    return TypeMapper.create(this.getDatabaseType());
  }

  protected generateColumnCommentsDDL(tableName: string, fields: NormalizedField[]): string[] {
    const comments: string[] = [];

    for (const field of fields) {
      if (field.comment)
        comments.push(buildColumnComment(tableName, field, this.getDatabaseType()));
    }

    return comments;
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

  generateIndexDDL(tableName: string, index: IndexDefinition): string {
    return this.generateStandardIndexDDL(tableName, index);
  }

  generateForeignKeyDDL(tableName: string, fk: ForeignKeyDefinition): string {
    return buildForeignKeyDDL(tableName, fk, this.getDatabaseType());
  }
}
