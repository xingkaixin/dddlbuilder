import { getSchemaAndTable } from '@ddlbuilder/ddl-core';
import type {
  DatabaseType,
  FieldRow,
  PersistedState,
  TableMiscConfig,
  MysqlPartitionConfig,
} from '@ddlbuilder/shared-types';
import { createFieldId } from '@ddlbuilder/workspace-core';
import { createEmptyRow } from './helpers';
import type { ParsedResult } from '@ddlbuilder/ddl-core/parser';

const DEFAULT_TABLE_MISC_CONFIG: TableMiscConfig = {
  enabled: false,
  engine: '',
  charset: '',
  collation: '',
  tablespace: '',
};

const MYSQL_PARTITION_DBS: DatabaseType[] = ['mysql', 'mariadb', 'tidb'];

const DEFAULT_MYSQL_PARTITION_CONFIG: MysqlPartitionConfig = {
  enabled: false,
  type: 'RANGE',
  columns: [],
  partitionCount: 4,
  partitions: [],
};

export function convertParsedResultToPersistedState(
  result: ParsedResult,
  importDbType: DatabaseType,
): PersistedState {
  const parsedName =
    result.schemaName || !result.tableName.includes('.')
      ? { schema: result.schemaName || '', table: result.tableName }
      : getSchemaAndTable(result.tableName);

  const newRows: FieldRow[] = result.fields.map((field) => ({
    id: createFieldId(),
    fieldName: field.name,
    fieldType: field.type,
    fieldComment: field.comment,
    nullable: field.nullable !== false,
    defaultKind: field.defaultKind,
    defaultValue: field.defaultValue,
    onUpdate: field.onUpdate,
  }));

  const minRows = 12;
  if (newRows.length < minRows) {
    for (let i = newRows.length; i < minRows; i += 1) {
      newRows.push(createEmptyRow());
    }
  }

  return {
    schemaName: parsedName.schema,
    tableName: parsedName.table,
    tableComment: result.tableComment,
    dbType: importDbType,
    sqlFormatMode: 'compact',
    rows: newRows,
    addCount: 10,
    indexInput: '',
    currentIndexFields: [],
    indexes: result.indexes,
    authInput: '',
    authObjects: result.authObjects,
    mysqlPartitionConfig: MYSQL_PARTITION_DBS.includes(importDbType)
      ? {
          ...DEFAULT_MYSQL_PARTITION_CONFIG,
          ...result.mysqlPartitionConfig,
        }
      : DEFAULT_MYSQL_PARTITION_CONFIG,
    tableMiscConfig: {
      ...DEFAULT_TABLE_MISC_CONFIG,
      ...result.tableMiscConfig,
    },
    foreignKeys: result.foreignKeys || [],
  };
}
