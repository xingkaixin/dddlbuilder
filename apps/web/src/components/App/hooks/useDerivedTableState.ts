import { useCallback, useMemo } from 'react';
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
import { toPersistedState } from '@/stores/editorDocumentCodec';
import {
  normalizePersistedStateSignature,
  serializePersistedStateForComparison,
} from '@/utils/persistedStateSignature';
import { diffPersistedState, supportsMysqlPartition, type TableDiff } from '@ddlbuilder/ddl-core';
import { useEditorStore } from '@/stores';

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
  loadedTableState: PersistedState | null;
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
    loadedTableState,
  } = deps;

  // --- 字段派生 ---
  const normalizedFields = useMemo(() => buildNormalizedFields(rows), [rows]);

  const availableFields = useMemo(
    () => normalizedFields.map((field) => field.name).filter((name) => name.length > 0),
    [normalizedFields],
  );

  const filledRowCount = useMemo(() => rows.filter((row) => row.fieldName?.trim()).length, [rows]);

  // --- Tab 计算 ---
  const canPartitionMysqlTable = supportsMysqlPartition(dbType);

  // --- 持久化状态 ---
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

  const buildPersistedState = useCallback(() => toPersistedState(useEditorStore.getState()), []);

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
    if (!isLoadedDirty || !loadedTableState) return null;
    return diffPersistedState(loadedTableState, currentPersistedState);
  }, [isLoadedDirty, loadedTableState, currentPersistedState]);

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
