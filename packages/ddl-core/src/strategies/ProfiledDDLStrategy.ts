import type { DatabaseType, NormalizedField, SqlFormatMode } from '@ddlbuilder/shared-types';
import {
  getCanonicalBaseType,
  supportsAutoIncrement,
  supportsDefaultCurrentTimestamp,
  supportsOnUpdateCurrentTimestamp,
  supportsUuidDefault,
  formatConstantDefault,
  escapeSingleQuotes,
  parseFieldType,
  getSchemaAndTable,
} from '../utils/databaseTypeMapping';
import { AbstractDDLStrategy } from './AbstractDDLStrategy';
import { DIALECT_PROFILES } from './dialectProfiles';
import type { DialectProfile } from './dialectProfiles';
import {
  buildCitusShardingStatement,
  buildMysqlPartitionClause,
  buildOracleSynonym,
  buildExtendedProperty,
} from './dialectStatements';
import type { ConfiguredTableDDL, TableFeatureConfig } from '../interfaces/DDLStrategy';

/**
 * 由方言描述表驱动的通用 CREATE TABLE 生成器。
 * 方言差异全部来自 DialectProfile，新增数据库只需在 DIALECT_PROFILES 加一行。
 */
export class ProfiledDDLStrategy extends AbstractDDLStrategy {
  private readonly databaseType: DatabaseType;

  constructor(databaseType: DatabaseType) {
    super();
    this.databaseType = databaseType;
  }

  getDatabaseType(): DatabaseType {
    return this.databaseType;
  }

  private get profile(): DialectProfile {
    return DIALECT_PROFILES[this.databaseType];
  }

  override applyTableFeatures(
    tableName: string,
    tableDDL: string,
    config: TableFeatureConfig,
  ): ConfiguredTableDDL {
    const configured = super.applyTableFeatures(tableName, tableDDL, config);

    if (this.databaseType === 'postgresql-citus' && config.citusShardingConfig) {
      return {
        ...configured,
        trailingStatements: [
          ...configured.trailingStatements,
          buildCitusShardingStatement(tableName, config.citusShardingConfig),
        ],
      };
    }

    if (this.databaseType === 'oracle') {
      return {
        ...configured,
        trailingStatements: [...configured.trailingStatements, buildOracleSynonym(tableName)],
      };
    }

    if (this.profile.supportsPartition && config.mysqlPartitionConfig?.enabled) {
      const partitionClause = buildMysqlPartitionClause(config.mysqlPartitionConfig);
      if (partitionClause) {
        return {
          ...configured,
          tableDDL: configured.tableDDL.replace(/;$/, `${partitionClause};`),
        };
      }
    }

    return configured;
  }

  generateTableDDL(
    tableName: string,
    tableComment: string,
    fields: NormalizedField[],
    _tableMiscConfig?: undefined,
    sqlFormatMode: SqlFormatMode = 'compact',
  ): string {
    const typeMapper = this.createTypeMapper();
    const columns = fields.map((field) => this.renderColumn(field, typeMapper));
    const columnLines = this.renderColumnDefinitions(columns, sqlFormatMode);

    switch (this.profile.commentChannel) {
      case 'inline':
        return this.assembleInlineTable(tableName, tableComment, columnLines);
      case 'comment-on':
        return this.assembleCommentOnTable(tableName, tableComment, fields, columnLines);
      case 'extended-property':
        return this.assembleExtendedPropertyTable(tableName, tableComment, fields, columnLines);
    }
  }

  private renderColumn(
    field: NormalizedField,
    typeMapper: ReturnType<AbstractDDLStrategy['createTypeMapper']>,
  ): { name: string; body: string; comment?: string } {
    const parsedType = parseFieldType(field.type);
    const type = typeMapper.mapType(parsedType);
    const base = getCanonicalBaseType(field.type);

    const segments: Record<'identity' | 'nullability' | 'default' | 'onUpdate', string> = {
      identity: this.identityClauseFor(field, base),
      nullability: field.nullable ? (this.profile.explicitNull ? ' NULL' : '') : ' NOT NULL',
      default: this.defaultClauseFor(field, base),
      onUpdate:
        field.onUpdate === 'current_timestamp' &&
        supportsOnUpdateCurrentTimestamp(this.databaseType, base)
          ? ' ON UPDATE CURRENT_TIMESTAMP'
          : '',
    };

    const body = `${type}${this.profile.clauseOrder
      .map((key) => segments[key])
      .join('')}${segments.onUpdate}`;
    const comment =
      this.profile.commentChannel === 'inline' ? this.inlineComment(field) : undefined;

    return { name: this.formatFieldName(field.name), body, comment };
  }

  private identityClauseFor(field: NormalizedField, canonicalBase: string): string {
    if (!this.profile.identityClause) return '';
    if (field.defaultKind !== 'auto_increment') return '';
    if (!supportsAutoIncrement(this.databaseType, canonicalBase)) return '';
    return ` ${this.profile.identityClause}`;
  }

  private defaultClauseFor(field: NormalizedField, canonicalBase: string): string {
    if (field.defaultKind === 'constant') {
      return formatConstantDefault(canonicalBase, field.defaultValue);
    }
    if (
      field.defaultKind === 'current_timestamp' &&
      supportsDefaultCurrentTimestamp(this.databaseType, canonicalBase)
    ) {
      return ` DEFAULT ${this.profile.nowFunction(canonicalBase)}`;
    }
    if (field.defaultKind === 'uuid' && supportsUuidDefault(canonicalBase)) {
      return ` DEFAULT ${this.profile.uuidFunction}`;
    }
    return '';
  }

  private inlineComment(field: NormalizedField): string | undefined {
    if (!field.comment) return undefined;
    return `COMMENT '${escapeSingleQuotes(field.comment)}'`;
  }

  private assembleInlineTable(
    tableName: string,
    tableComment: string,
    columnLines: string[],
  ): string {
    const commentClause = tableComment
      ? ` COMMENT='${escapeSingleQuotes(tableComment.trim())}'`
      : '';

    return `CREATE TABLE ${this.formatTableName(tableName)} (\n${columnLines.join(
      ',\n',
    )}\n)${commentClause};`;
  }

  private assembleCommentOnTable(
    tableName: string,
    tableComment: string,
    fields: NormalizedField[],
    columnLines: string[],
  ): string {
    const qualifiedTableName = this.formatTableName(tableName);
    const statements: string[] = [
      `CREATE TABLE ${qualifiedTableName} (\n${columnLines.join(',\n')}\n);`,
    ];

    if (tableComment.trim()) {
      statements.push(
        `COMMENT ON TABLE ${qualifiedTableName} IS '${escapeSingleQuotes(tableComment.trim())}';`,
      );
    }

    statements.push(...this.generateColumnCommentsDDL(tableName, fields));

    return statements.join('\n');
  }

  private assembleExtendedPropertyTable(
    tableName: string,
    tableComment: string,
    fields: NormalizedField[],
    columnLines: string[],
  ): string {
    const { schema, table } = getSchemaAndTable(tableName);
    const qualified = schema ? `${schema}.${table}` : table;
    const statements: string[] = [`CREATE TABLE ${qualified} (\n${columnLines.join(',\n')}\n);`];

    if (tableComment.trim()) {
      statements.push(buildExtendedProperty({ value: tableComment.trim(), schema, table }));
    }

    fields
      .filter((field) => field.comment)
      .forEach((field) => {
        statements.push(
          buildExtendedProperty({
            value: field.comment,
            schema,
            table,
            column: field.name,
          }),
        );
      });
    return statements.join('\n');
  }
}
