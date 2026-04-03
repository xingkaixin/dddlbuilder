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
} from '@/types';
import { buildNormalizedFields } from '@/stores';
import { sanitizeIndexesForPersist } from '@/utils/indexUtils';
import { diffPersistedState, type TableDiff } from '@/utils/tableDiff';

interface UseDerivedTableStateDeps {
  // 基础表数据
  schemaName: string;
  tableName: string;
  tableComment: string;
  dbType: DatabaseType;
  sqlFormatMode: SqlFormatMode;
  addCount: number;
  rows: FieldRow[];
  indexes: IndexDefinition[];
  indexInput: string;
  currentIndexFields: IndexField[];
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
    dbType,
    sqlFormatMode,
    addCount,
    rows,
    indexes,
    indexInput,
    currentIndexFields,
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

  // --- 索引统计 ---
  const indexStats = useMemo(
    () =>
      indexes.reduce(
        (acc, index) => {
          if (index.isPrimary) {
            acc.primary += 1;
          } else if (index.unique) {
            acc.unique += 1;
          } else {
            acc.normal += 1;
          }
          return acc;
        },
        { primary: 0, unique: 0, normal: 0 },
      ),
    [indexes],
  );

  useEffect(() => {
    if (indexes.length > 0 && tableName) {
      updateIndexNames(tableName, dbType);
    }
  }, [tableName, dbType, indexes.length, updateIndexNames]);

  // --- Tab 计算 ---
  const supportsMysqlPartition = ['mysql', 'mariadb', 'tidb'].includes(dbType);

  // --- 持久化状态 ---
  const normalizedRowsForPersist = useMemo(
    () =>
      rows.map((row) => ({
        ...row,
        order: row.order || 0,
        fieldName: row.fieldName || '',
        fieldComment: row.fieldComment || '',
        fieldType: row.fieldType || '',
        nullable: row.nullable === '否' ? '否' : '是',
        defaultKind: row.defaultKind || '',
        defaultValue: row.defaultValue || '',
        onUpdate: row.onUpdate || '',
      })),
    [rows],
  );

  const sanitizedIndexesForPersist = useMemo(() => sanitizeIndexesForPersist(indexes), [indexes]);

  const currentPersistedState = useMemo(
    (): PersistedState => ({
      schemaName,
      tableName,
      tableComment,
      dbType,
      sqlFormatMode,
      rows: normalizedRowsForPersist,
      addCount,
      indexInput,
      currentIndexFields,
      indexes: sanitizedIndexesForPersist,
      authInput,
      authObjects,
      citusShardingConfig: dbType === 'postgresql-citus' ? citusShardingConfig : undefined,
      mysqlPartitionConfig: supportsMysqlPartition ? mysqlPartitionConfig : undefined,
      tableMiscConfig,
      fieldTableViewConfig: {
        freezeEnabled: fieldTableFreezeEnabled,
        freezeColumns: fieldTableFreezeColumns,
      },
    }),
    [
      schemaName,
      tableName,
      tableComment,
      dbType,
      sqlFormatMode,
      normalizedRowsForPersist,
      addCount,
      indexInput,
      currentIndexFields,
      sanitizedIndexesForPersist,
      authInput,
      authObjects,
      citusShardingConfig,
      mysqlPartitionConfig,
      supportsMysqlPartition,
      tableMiscConfig,
      fieldTableFreezeEnabled,
      fieldTableFreezeColumns,
    ],
  );

  const buildPersistedState = useCallback(
    (): PersistedState => currentPersistedState,
    [currentPersistedState],
  );

  const serializePersistedState = useCallback((state: PersistedState) => JSON.stringify(state), []);

  // --- 加载状态派生 ---
  const currentStateSignature = useMemo(
    () => (loadedTableSignature == null ? null : serializePersistedState(currentPersistedState)),
    [loadedTableSignature, currentPersistedState, serializePersistedState],
  );

  const hasLoadedTable = Boolean(loadedTableNormalizedName);
  const isLoadedDirty =
    hasLoadedTable &&
    loadedTableSignature != null &&
    currentStateSignature != null &&
    currentStateSignature !== loadedTableSignature;
  const canSaveCurrent = !hasLoadedTable || isLoadedDirty;
  const loadedStatus = hasLoadedTable ? (isLoadedDirty ? 'dirty' : 'clean') : null;
  const saveDialogTitle = hasLoadedTable ? '更新保存的表' : '保存当前表';
  const saveDialogDescription = hasLoadedTable
    ? '当前为已加载表，保存将覆盖原记录。'
    : '保存后可在左侧列表中快速加载。';
  const saveInputDisabled = hasLoadedTable;

  // --- Diff ---
  const tableDiff = useMemo<TableDiff | null>(() => {
    if (!isLoadedDirty || !loadedTableSignature) return null;
    try {
      const oldState = JSON.parse(loadedTableSignature) as PersistedState;
      const newState = currentPersistedState;
      return diffPersistedState(oldState, newState);
    } catch {
      return null;
    }
  }, [isLoadedDirty, loadedTableSignature, currentPersistedState]);

  return {
    // 字段
    normalizedFields,
    availableFields,
    filledRowCount,
    // 索引
    indexStats,
    // Tab
    supportsMysqlPartition,
    // 持久化
    currentPersistedState,
    buildPersistedState,
    serializePersistedState,
    // 加载状态
    hasLoadedTable,
    isLoadedDirty,
    canSaveCurrent,
    loadedStatus,
    saveDialogTitle,
    saveDialogDescription,
    saveInputDisabled,
    // Diff
    tableDiff,
  };
}
