import { escapeSqlString } from '../utils/databaseFamily';
import {
  normalizeHiveBucketCount,
  type HiveClusteringConfig,
  type NormalizedField,
  type SqlFormatMode,
  type TableMiscConfig,
} from '@ddlbuilder/shared-types';
import { parseFieldType } from '../utils/databaseTypeMapping';
import { AbstractDDLStrategy } from './AbstractDDLStrategy';

/**
 * Hive 的建表语句结构与关系型方言差异过大（EXTERNAL / PARTITIONED BY /
 * CLUSTERED BY / STORED AS / LOCATION），不适合塞进通用骨架，保留独立实现。
 */
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
    const config = tableMiscConfig?.enabled ? tableMiscConfig : undefined;

    const columns = fields.map((field) => {
      const parsedType = parseFieldType(field.type);
      const type = typeMapper.mapType(parsedType);

      const comment = field.comment ? ` COMMENT '${escapeSqlString(field.comment, 'hive')}'` : '';

      return {
        name: this.formatFieldName(field.name),
        body: type,
        comment: comment.trim() || undefined,
      };
    });
    const columnLines = this.renderColumnDefinitions(columns, sqlFormatMode);

    const externalClause = config?.external ? 'EXTERNAL ' : '';

    const commentClause = tableComment
      ? ` COMMENT '${escapeSqlString(tableComment.trim(), 'hive')}'`
      : '';

    const partitionClause = this.buildPartitionClause(config?.partitions);

    const clusteringClause = this.buildClusteringClause(config?.partitions?.clustering);

    const storedAsClause = config?.storedAs ? `\nSTORED AS ${config.storedAs}` : '';

    const locationClause = config?.location
      ? `\nLOCATION '${escapeSqlString(config.location, 'hive')}'`
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
      const comment = col.comment ? ` COMMENT '${escapeSqlString(col.comment, 'hive')}'` : '';
      return `  ${this.formatFieldName(col.name)} ${type}${comment}`;
    });

    return `\nPARTITIONED BY (\n${columns.join(',\n')}\n)`;
  }

  private buildClusteringClause(config?: HiveClusteringConfig): string {
    if (!config?.enabled || config.columns.length === 0) {
      return '';
    }

    const columns = config.columns.map((name) => this.formatFieldName(name)).join(', ');
    return `\nCLUSTERED BY (${columns}) INTO ${normalizeHiveBucketCount(config.bucketCount)} BUCKETS`;
  }
}
