import { useCallback, useEffect, useMemo } from 'react';
import type {
  PersistedState,
  FieldRow,
  IndexDefinition,
  IndexField,
  DatabaseType,
  CitusShardingConfig,
  MysqlPartitionConfig,
  SqlFormatMode,
  TableMiscConfig,
  ForeignKeyDefinition,
} from '@ddlbuilder/shared-types';
import { buildNormalizedFields } from '@/stores';
import { sanitizeIndexesForPersist } from '@/utils/indexUtils';
import {
  normalizePersistedStateSignature,
  serializePersistedStateForComparison,
} from '@/utils/persistedStateSignature';
import { diffPersistedState, supportsMysqlPartition, type TableDiff } from '@ddlbuilder/ddl-core';
import { useEditorStore } from '@/stores';
import type { EditorStoreState } from '@/stores/editorStoreTypes';

type EditorDocumentState = Pick<
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

const buildEditorPersistedState = (state: EditorDocumentState): PersistedState => ({
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

interface UseDerivedTableStateDeps {
  // 基础表数据
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
  indexInput: string;
  currentIndexFields: IndexField[];
  // 外键
  foreignKeys: ForeignKeyDefinition[];
  // 认证
  authInput: string;
  authObjects: string[];
  // 配置
  citusShardingConfig: CitusShardingConfig;
  mysqlPartitionConfig: MysqlPartitionConfig;
  tableMiscConfig: TableMiscConfig;
  fieldTableFreezeEnabled: boolean;
  fieldTableFreezeColumns: number;
  // 加载状态
  loadedTableNormalizedName: string | null;
  loadedTableSignature: string | null;
  // Index 更新
  updateIndexNames: (tableName: string, dbType: DatabaseType) => void;
}

/**
 * 聚合 App 组件中所有派生/计算状态。
 * 从 App/index.tsx 中提取，减少主组件的样板代码。
 */
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
    indexInput,
    currentIndexFields,
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
    updateIndexNames,
  } = deps;

  // --- 字段派生 ---
  const normalizedFields = useMemo(() => buildNormalizedFields(rows), [rows]);

  const availableFields = useMemo(
    () => normalizedFields.map((field) => field.name).filter((name) => name.length > 0),
    [normalizedFields],
  );

  const filledRowCount = useMemo(() => rows.filter((row) => row.fieldName?.trim()).length, [rows]);

  useEffect(() => {
    if (indexes.length > 0 && tableName) {
      updateIndexNames(tableName, dbType);
    }
  }, [tableName, dbType, indexes.length, updateIndexNames]);

  // --- Tab 计算 ---
  const canPartitionMysqlTable = supportsMysqlPartition(dbType);

  // --- 持久化状态 ---
  const currentPersistedState = useMemo(
    () =>
      buildEditorPersistedState({
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
        indexInput,
        currentIndexFields,
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
      indexInput,
      currentIndexFields,
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

  const buildPersistedState = useCallback(
    () => buildEditorPersistedState(useEditorStore.getState()),
    [],
  );

  const serializePersistedState = serializePersistedStateForComparison;
  const normalizedLoadedTableSignature = useMemo(
    () =>
      loadedTableSignature == null ? null : normalizePersistedStateSignature(loadedTableSignature),
    [loadedTableSignature],
  );

  // --- 加载状态派生 ---
  const currentStateSignature = useMemo(
    () =>
      normalizedLoadedTableSignature == null
        ? null
        : serializePersistedState(currentPersistedState),
    [normalizedLoadedTableSignature, currentPersistedState, serializePersistedState],
  );

  const hasLoadedTable = Boolean(loadedTableNormalizedName);
  const isLoadedDirty =
    hasLoadedTable &&
    normalizedLoadedTableSignature != null &&
    currentStateSignature != null &&
    currentStateSignature !== normalizedLoadedTableSignature;
  const canSaveCurrent = !hasLoadedTable || isLoadedDirty;
  const loadedStatus = hasLoadedTable ? (isLoadedDirty ? 'dirty' : 'clean') : null;
  const saveInputDisabled = hasLoadedTable;

  // --- Diff ---
  const tableDiff = useMemo<TableDiff | null>(() => {
    if (!isLoadedDirty || !normalizedLoadedTableSignature) return null;
    try {
      const oldState = JSON.parse(normalizedLoadedTableSignature) as PersistedState;
      const newState = currentPersistedState;
      return diffPersistedState(oldState, newState);
    } catch {
      return null;
    }
  }, [isLoadedDirty, normalizedLoadedTableSignature, currentPersistedState]);

  return {
    // 字段
    normalizedFields,
    availableFields,
    filledRowCount,
    // Tab
    supportsMysqlPartition: canPartitionMysqlTable,
    // 持久化
    currentPersistedState,
    buildPersistedState,
    serializePersistedState,
    // 加载状态
    hasLoadedTable,
    isLoadedDirty,
    canSaveCurrent,
    loadedStatus,
    saveInputDisabled,
    // Diff
    tableDiff,
  };
}
