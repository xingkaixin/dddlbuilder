import { supportsMysqlPartition } from '@ddlbuilder/ddl-core';
import {
  normalizeAddCount,
  normalizeFreezeColumns,
  normalizeOptionalMysqlPartitionCount,
  normalizeTableMiscConfigNumbers,
  type PersistedState,
} from '@ddlbuilder/shared-types';
import { fillMissingIndexNames, sanitizeIndexesForPersist } from '@/utils/indexUtils';
import type { EditorStoreState } from './editorStoreTypes';
import { DEFAULT_PARTITION_CONFIG } from './partitionStore';
import { DEFAULT_SHARDING_CONFIG } from './shardingStore';
import { DEFAULT_TABLE_MISC_CONFIG } from './tableOptionsStore';

export type EditorDocumentState = Pick<
  EditorStoreState,
  | 'objectType'
  | 'schemaName'
  | 'tableName'
  | 'tableComment'
  | 'dbType'
  | 'sqlFormatMode'
  | 'viewDefinition'
  | 'viewCreateOrReplace'
  | 'rows'
  | 'addCount'
  | 'indexInput'
  | 'currentIndexFields'
  | 'indexes'
  | 'authInput'
  | 'authObjects'
  | 'citusShardingConfig'
  | 'mysqlPartitionConfig'
  | 'tableMiscConfig'
  | 'fieldTableFreezeEnabled'
  | 'fieldTableFreezeColumns'
  | 'foreignKeys'
>;

export const toEditorDocumentState = (state: PersistedState): EditorDocumentState => {
  const mysqlPartitionConfig = state.mysqlPartitionConfig ?? DEFAULT_PARTITION_CONFIG;
  const { partitionCount: _partitionCount, ...mysqlPartitionConfigBase } = mysqlPartitionConfig;
  const partitionCount = normalizeOptionalMysqlPartitionCount(mysqlPartitionConfig.partitionCount);

  return {
    schemaName: state.schemaName ?? '',
    tableName: state.tableName ?? '',
    tableComment: state.tableComment ?? '',
    objectType: state.objectType ?? 'table',
    viewDefinition: state.viewDefinition ?? '',
    viewCreateOrReplace: state.viewCreateOrReplace !== false,
    dbType: state.dbType ?? 'mysql',
    sqlFormatMode: state.sqlFormatMode ?? 'compact',
    addCount: normalizeAddCount(state.addCount),
    rows: state.rows,
    indexInput: state.indexInput ?? '',
    currentIndexFields: state.currentIndexFields ?? [],
    indexes: fillMissingIndexNames(state.indexes ?? [], state.tableName, state.dbType),
    authInput: state.authInput ?? '',
    authObjects: state.authObjects ?? [],
    citusShardingConfig: state.citusShardingConfig ?? DEFAULT_SHARDING_CONFIG,
    mysqlPartitionConfig: {
      ...mysqlPartitionConfigBase,
      ...(partitionCount === undefined ? {} : { partitionCount }),
    },
    tableMiscConfig: normalizeTableMiscConfigNumbers(
      state.tableMiscConfig ?? DEFAULT_TABLE_MISC_CONFIG,
    ),
    fieldTableFreezeEnabled: state.fieldTableViewConfig?.freezeEnabled ?? false,
    fieldTableFreezeColumns: normalizeFreezeColumns(state.fieldTableViewConfig?.freezeColumns ?? 3),
    foreignKeys: state.foreignKeys ?? [],
  };
};

export const toPersistedState = (state: EditorDocumentState): PersistedState => ({
  objectType: state.objectType,
  schemaName: state.schemaName,
  tableName: state.tableName,
  tableComment: state.tableComment,
  dbType: state.dbType,
  sqlFormatMode: state.sqlFormatMode,
  viewDefinition: state.viewDefinition,
  viewCreateOrReplace: state.viewCreateOrReplace,
  rows: state.rows.map((row) => ({
    ...row,
    fieldName: row.fieldName || '',
    fieldComment: row.fieldComment || '',
    fieldType: row.fieldType || '',
    nullable: row.nullable !== false,
    defaultKind: row.defaultKind ?? 'none',
    defaultValue: row.defaultValue || '',
    onUpdate: row.onUpdate ?? 'none',
  })),
  addCount: state.addCount,
  indexInput: state.indexInput,
  currentIndexFields: state.currentIndexFields,
  indexes: sanitizeIndexesForPersist(state.indexes),
  authInput: state.authInput,
  authObjects: state.authObjects,
  citusShardingConfig: state.dbType === 'postgresql-citus' ? state.citusShardingConfig : undefined,
  mysqlPartitionConfig: supportsMysqlPartition(state.dbType)
    ? state.mysqlPartitionConfig
    : undefined,
  tableMiscConfig: state.tableMiscConfig,
  fieldTableViewConfig: {
    freezeEnabled: state.fieldTableFreezeEnabled,
    freezeColumns: state.fieldTableFreezeColumns,
  },
  foreignKeys: state.foreignKeys.length > 0 ? state.foreignKeys : undefined,
});
