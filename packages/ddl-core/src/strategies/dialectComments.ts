import type { DatabaseType, NormalizedField } from '@ddlbuilder/shared-types';
import {
  escapeSingleQuotes,
  formatSqlTableName,
  getSchemaAndTable,
} from '../utils/databaseTypeMapping';
import { formatSqlIdentifier, unquoteSqlIdentifier } from '../utils/sqlIdentifiers';
import { DIALECT_PROFILES } from './dialectProfiles';

interface ExtendedPropertyInput {
  value: string;
  schema: string;
  table: string;
  column?: string;
  operation?: 'add' | 'update' | 'drop';
}

export function buildExtendedProperty({
  value,
  schema,
  table,
  column,
  operation = 'add',
}: ExtendedPropertyInput): string {
  const literal = (name: string) => `N'${escapeSingleQuotes(unquoteSqlIdentifier(name))}'`;
  const parameters = [
    "@name = N'MS_Description'",
    ...(operation === 'drop' ? [] : [`@value = N'${escapeSingleQuotes(value)}'`]),
    `@level0type = N'SCHEMA', @level0name = ${schema ? literal(schema) : '@ddlbuilderSchema'}`,
    `@level1type = N'TABLE', @level1name = ${literal(table)}`,
    ...(column ? [`@level2type = N'COLUMN', @level2name = ${literal(column)}`] : []),
  ];
  const statement = `EXEC sp_${operation}extendedproperty\n    ${parameters.join(',\n    ')};`;
  if (schema) return statement;
  // A separate batch scopes the variable so several comments can share one SQL script.
  const batch = `DECLARE @ddlbuilderSchema sysname = OBJECT_SCHEMA_NAME(OBJECT_ID(N'${escapeSingleQuotes(formatSqlTableName(table, 'sqlserver'))}'));\n${statement}`;
  return `EXEC sys.sp_executesql N'${escapeSingleQuotes(batch)}';`;
}

export function buildColumnComment(
  tableName: string,
  field: Pick<NormalizedField, 'name' | 'comment'>,
  dbType: DatabaseType,
  previousComment?: string,
): string {
  switch (DIALECT_PROFILES[dbType].commentChannel) {
    case 'inline':
      return '';
    case 'comment-on':
      return `COMMENT ON COLUMN ${formatSqlTableName(tableName, dbType)}.${formatSqlIdentifier(field.name, dbType)} IS '${escapeSingleQuotes(field.comment)}';`;
    case 'extended-property': {
      const { schema, table } = getSchemaAndTable(tableName);
      return buildExtendedProperty({
        value: field.comment,
        schema,
        table,
        column: field.name,
        operation: !field.comment ? 'drop' : previousComment ? 'update' : 'add',
      });
    }
  }
}
