import { getSchemaAndTable } from '@ddlbuilder/ddl-core';
import type {
  DatabaseType,
  FieldRow,
  PersistedState,
  TableMiscConfig,
  MysqlPartitionConfig,
} from '@ddlbuilder/shared-types';
import { createEmptyRow } from './helpers';
import type { ParsedResult } from './SqlParser';

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

type UiDefaultValue = '无' | '自增' | '常量' | '当前时间' | 'uuid';

export function convertParsedResultToPersistedState(
  result: ParsedResult,
  importDbType: DatabaseType,
): PersistedState {
  const parsedName =
    result.schemaName || !result.tableName.includes('.')
      ? { schema: result.schemaName || '', table: result.tableName }
      : getSchemaAndTable(result.tableName);

  const newRows: FieldRow[] = result.fields.map((field, index) => {
    let uiNullable = '是';
    if (field.nullable === false) uiNullable = '否';

    let uiDefaultKind: UiDefaultValue = '无';
    switch (field.defaultKind) {
      case 'auto_increment':
        uiDefaultKind = '自增';
        break;
      case 'constant':
        uiDefaultKind = '常量';
        break;
      case 'current_timestamp':
        uiDefaultKind = '当前时间';
        break;
      case 'uuid':
        uiDefaultKind = 'uuid';
        break;
      default:
        uiDefaultKind = '无';
        break;
    }

    let uiOnUpdate: '无' | '当前时间' = '无';
    if (field.onUpdate === 'current_timestamp') {
      uiOnUpdate = '当前时间';
    }

    return {
      order: index + 1,
      fieldName: field.name,
      fieldType: field.type,
      fieldComment: field.comment,
      nullable: uiNullable,
      defaultKind: uiDefaultKind,
      defaultValue: field.defaultValue,
      onUpdate: uiOnUpdate,
    };
  });

  const minRows = 12;
  if (newRows.length < minRows) {
    for (let i = newRows.length; i < minRows; i += 1) {
      newRows.push(createEmptyRow(i));
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
