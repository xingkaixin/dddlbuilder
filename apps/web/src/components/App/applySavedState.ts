import type { PersistedState } from '@ddlbuilder/shared-types';
import {
  useAppStore,
  useAuthStore,
  useFieldStore,
  useForeignKeyStore,
  useIndexStore,
  usePartitionStore,
  useShardingStore,
  useTableOptionsStore,
} from '@/stores';

const DEFAULT_FIELD_TABLE_FREEZE_ENABLED = false;
const DEFAULT_FIELD_TABLE_FREEZE_COLUMNS = 3;

export function applySavedState(state: PersistedState) {
  const {
    setSchemaName,
    setTableName,
    setTableComment,
    setObjectType,
    setViewDefinition,
    setViewCreateOrReplace,
    setDbType,
    setSqlFormatMode,
    setAddCount,
    setFieldTableFreezeEnabled,
    setFieldTableFreezeColumns,
  } = useAppStore.getState();

  setSchemaName(state.schemaName ?? '');
  setTableName(state.tableName ?? '');
  setTableComment(state.tableComment ?? '');
  setObjectType(state.objectType ?? 'table');
  setViewDefinition(state.viewDefinition ?? '');
  setViewCreateOrReplace(state.viewCreateOrReplace !== false);
  setDbType(state.dbType ?? 'mysql');
  setSqlFormatMode(state.sqlFormatMode ?? 'compact');
  setAddCount(state.addCount);

  useFieldStore.getState().setRows(state.rows);

  const { setIndexes, setIndexInput, setCurrentIndexFields } = useIndexStore.getState();
  setIndexes(state.indexes ?? []);
  setIndexInput(state.indexInput ?? '');
  setCurrentIndexFields(state.currentIndexFields ?? []);

  useForeignKeyStore.getState().setForeignKeys(state.foreignKeys ?? []);

  const { setAuthObjects, setAuthInput } = useAuthStore.getState();
  setAuthObjects(state.authObjects ?? []);
  setAuthInput(state.authInput ?? '');

  const shardingStore = useShardingStore.getState();
  if (state.citusShardingConfig) {
    shardingStore.setCitusShardingConfig(state.citusShardingConfig);
  } else {
    shardingStore.resetCitusSharding();
  }

  const partitionStore = usePartitionStore.getState();
  if (state.mysqlPartitionConfig) {
    partitionStore.setMysqlPartitionConfig(state.mysqlPartitionConfig);
  } else {
    partitionStore.resetPartition();
  }

  const tableOptionsStore = useTableOptionsStore.getState();
  if (state.tableMiscConfig) {
    tableOptionsStore.setTableMiscConfig(state.tableMiscConfig);
  } else {
    tableOptionsStore.resetTableMiscConfig();
  }

  setFieldTableFreezeEnabled(
    state.fieldTableViewConfig?.freezeEnabled ?? DEFAULT_FIELD_TABLE_FREEZE_ENABLED,
  );
  setFieldTableFreezeColumns(
    state.fieldTableViewConfig?.freezeColumns ?? DEFAULT_FIELD_TABLE_FREEZE_COLUMNS,
  );
}
