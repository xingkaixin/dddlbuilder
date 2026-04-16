import type {
  HiveClusteringConfig,
  NormalizedField,
  SqlFormatMode,
  TableMiscConfig,
} from '@ddlbuilder/shared-types';
import { escapeSingleQuotes, parseFieldType } from '../utils/databaseTypeMapping';
import { AbstractDDLStrategy } from './AbstractDDLStrategy';

export class HiveStrategy extends AbstractDDLStrategy {
  getDatabaseType(): 'hive' {
    return 'hive';
  }

  generateTableDDL(
    tableName: string,
    tableComment: string,
    fields: NormalizedField[],
    tableMiscConfig?: TableMiscConfig,
    sqlFormatMode: SqlFormatMode = 'compact',
  ): string {
    const typeMapper = this.createTypeMapper();

    const columns = fields.map((field) => {
      const parsedType = parseFieldType(field.type);
      const type = typeMapper.mapType(parsedType);

      const comment = field.comment ? ` COMMENT '${escapeSingleQuotes(field.comment)}'` : '';

      return {
        name: this.formatFieldName(field.name),
        body: type,
        comment: comment.trim() || undefined,
      };
    });
    const columnLines = this.renderColumnDefinitions(columns, sqlFormatMode);

    const externalClause = tableMiscConfig?.external ? 'EXTERNAL ' : '';

    const commentClause = tableComment
      ? ` COMMENT '${escapeSingleQuotes(tableComment.trim())}'`
      : '';

    const partitionClause = this.buildPartitionClause(tableMiscConfig?.partitions);

    const clusteringClause = this.buildClusteringClause(tableMiscConfig?.partitions?.clustering);

    const storedAsClause = tableMiscConfig?.storedAs
      ? `\nSTORED AS ${tableMiscConfig.storedAs}`
      : '';

    const locationClause = tableMiscConfig?.location
      ? `\nLOCATION '${escapeSingleQuotes(tableMiscConfig.location)}'`
      : '';

    return (
      `CREATE ${externalClause}TABLE ${this.formatTableName(tableName)} (\n` +
      `${columnLines.join(',\n')}\n)` +
      `${partitionClause}${clusteringClause}${commentClause}${storedAsClause}${locationClause};`
    );
  }

  generateIndexDDL(): string {
    return '';
  }

  private buildPartitionClause(config?: TableMiscConfig['partitions']): string {
    if (!config?.enabled || config.columns.length === 0) {
      return '';
    }

    const typeMapper = this.createTypeMapper();
    const columns = config.columns.map((col) => {
      const parsedType = parseFieldType(col.type);
      const type = typeMapper.mapType(parsedType);
      const comment = col.comment ? ` COMMENT '${escapeSingleQuotes(col.comment)}'` : '';
      return `  ${col.name} ${type}${comment}`;
    });

    return `\nPARTITIONED BY (\n${columns.join(',\n')}\n)`;
  }

  private buildClusteringClause(config?: HiveClusteringConfig): string {
    if (!config?.enabled || config.columns.length === 0) {
      return '';
    }

    const columns = config.columns.join(', ');
    return `\nCLUSTERED BY (${columns}) INTO ${config.bucketCount} BUCKETS`;
  }
}
