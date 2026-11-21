import { useCallback, useDeferredValue, useMemo } from 'react';
import type {
  PersistedState,
  FieldRow,
  IndexDefinition,
  DatabaseType,
  CitusShardingConfig,
  MysqlPartitionConfig,
  SqlFormatMode,
  TableMiscConfig,
  ForeignKeyDefinition,
} from '@ddlbuilder/shared-types';
import { toPersistedState } from '@/stores/editorDocumentCodec';
import { normalizeSchemaStateSignature } from '@/utils/persistedStateSignature';
import { buildSchemaStateSignature } from '@ddlbuilder/workspace-core';
import { diffPersistedState, type TableDiff } from '@ddlbuilder/ddl-core';
import { useEditorStore } from '@/stores/editorStore';

interface UseDerivedTableStateDeps {
  objectType: NonNullable<PersistedState['objectType']>;
  schemaName: string;
  tableName: string;
  tableComment: string;
  viewDefinition: string;
  viewCreateOrReplace: boolean;
  dbType: DatabaseType;
  sqlFormatMode: SqlFormatMode;
  addCount: number;
  rows: FieldRow[];
  indexes: IndexDefinition[];
  foreignKeys: ForeignKeyDefinition[];
  authInput: string;
  authObjects: string[];
  citusShardingConfig: CitusShardingConfig;
  mysqlPartitionConfig: MysqlPartitionConfig;
  tableMiscConfig: TableMiscConfig;
  fieldTableFreezeEnabled: boolean;
  fieldTableFreezeColumns: number;
  loadedTableNormalizedName: string | null;
  loadedTableSignature: string | null;
  loadedTableState: PersistedState | null;
}

export function useDerivedTableState(deps: UseDerivedTableStateDeps) {
  const {
    schemaName,
    tableName,
    tableComment,
    objectType,
    viewDefinition,
    viewCreateOrReplace,
    dbType,
    sqlFormatMode,
    addCount,
    rows,
    indexes,
    foreignKeys,
    authInput,
    authObjects,
    citusShardingConfig,
    mysqlPartitionConfig,
    tableMiscConfig,
    fieldTableFreezeEnabled,
    fieldTableFreezeColumns,
    loadedTableNormalizedName,
    loadedTableSignature,
    loadedTableState,
  } = deps;

  const currentPersistedState = useMemo(
    () =>
      toPersistedState({
        objectType,
        schemaName,
        tableName,
        tableComment,
        dbType,
        sqlFormatMode,
        viewDefinition,
        viewCreateOrReplace,
        rows,
        addCount,
        indexes,
        authInput,
        authObjects,
        citusShardingConfig,
        mysqlPartitionConfig,
        tableMiscConfig,
        fieldTableFreezeEnabled,
        fieldTableFreezeColumns,
        foreignKeys,
      }),
    [
      schemaName,
      tableName,
      tableComment,
      objectType,
      viewDefinition,
      viewCreateOrReplace,
      dbType,
      sqlFormatMode,
      rows,
      addCount,
      indexes,
      authInput,
      authObjects,
      citusShardingConfig,
      mysqlPartitionConfig,
      tableMiscConfig,
      fieldTableFreezeEnabled,
      fieldTableFreezeColumns,
      foreignKeys,
    ],
  );

  const buildPersistedState = useCallback(() => toPersistedState(useEditorStore.getState()), []);

  const normalizedLoadedTableSignature = useMemo(
    () =>
      loadedTableSignature == null ? null : normalizeSchemaStateSignature(loadedTableSignature),
    [loadedTableSignature],
  );

  const currentStateSignature = useMemo(
    () =>
      normalizedLoadedTableSignature == null
        ? null
        : buildSchemaStateSignature(currentPersistedState),
    [normalizedLoadedTableSignature, currentPersistedState],
  );

  const hasLoadedTable = Boolean(loadedTableNormalizedName);

  const isLoadedDirty =
    hasLoadedTable &&
    normalizedLoadedTableSignature != null &&
    currentStateSignature != null &&
    currentStateSignature !== normalizedLoadedTableSignature;
  const canSaveCurrent = !hasLoadedTable || isLoadedDirty;
  const saveInputDisabled = hasLoadedTable;

  const deferredPersistedState = useDeferredValue(currentPersistedState);

  const tableDiff = useMemo<TableDiff | null>(() => {
    if (!isLoadedDirty || !loadedTableState) return null;

    return diffPersistedState(loadedTableState, deferredPersistedState);
  }, [isLoadedDirty, loadedTableState, deferredPersistedState]);

  return {
    currentPersistedState,
    buildPersistedState,
    hasLoadedTable,
    isLoadedDirty,
    canSaveCurrent,
    saveInputDisabled,
    tableDiff,
  };
}
