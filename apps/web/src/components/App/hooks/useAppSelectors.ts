import { useAppStore, useFieldStore, useIndexStore, useForeignKeyStore } from '@/stores';

/**
 * 聚合 App 组件所需的所有 zustand selector，按功能分组。
 *
 * action 走 getState()：它们在 store 的生命周期内引用恒定，订阅它们只会让每次 store
 * 变更都多跑一遍 selector 和一次比较，换不到任何重渲染。只有真正会变的状态值才订阅。
 */
export function useAppSelectors() {
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
    setActiveTab,
    resetTableConfig,
    resetTableViewConfig,
    setFieldTableFreezeEnabled,
    setFieldTableFreezeColumns,
    setIsClearDialogOpen,
    setShowFireworks,
    setSavedTablesDrawerOpen,
    setIsSaveDialogOpen,
    setIsRenameDialogOpen,
    setIsDeleteDialogOpen,
    setIsDiffDialogOpen,
    setVersionHistoryTarget,
    setIsReviewHistoryOpen,
    setIsStorageEstimatorOpen,
    setIsAIGenerateDialogOpen,
    setIsMockDataDialogOpen,
    setTimelinePlayerTarget,
  } = useAppStore.getState();

  const { setRows, initializeRows, resetRows: resetTableRows } = useFieldStore.getState();

  const {
    setIndexInput,
    setCurrentIndexFields,
    initializeIndexState,
    updateIndexNames,
    resetIndexState,
    setIndexes,
  } = useIndexStore.getState();

  const {
    setForeignKeys,
    initializeForeignKeyState,
    resetForeignKeyState,
    addForeignKey,
    removeForeignKey,
    updateForeignKey,
    syncFieldRename: syncForeignKeyFieldRename,
  } = useForeignKeyStore.getState();

  // --- 基础表配置 ---
  const schemaName = useAppStore((s) => s.schemaName);
  const tableName = useAppStore((s) => s.tableName);
  const tableComment = useAppStore((s) => s.tableComment);
  const objectType = useAppStore((s) => s.objectType);
  const viewDefinition = useAppStore((s) => s.viewDefinition);
  const viewCreateOrReplace = useAppStore((s) => s.viewCreateOrReplace);
  const dbType = useAppStore((s) => s.dbType);
  const sqlFormatMode = useAppStore((s) => s.sqlFormatMode);
  const addCount = useAppStore((s) => s.addCount);
  const activeTab = useAppStore((s) => s.activeTab);

  // --- 冻结列配置 ---
  const fieldTableFreezeEnabled = useAppStore((s) => s.fieldTableFreezeEnabled);
  const fieldTableFreezeColumns = useAppStore((s) => s.fieldTableFreezeColumns);

  // --- 全局 UI 状态 ---
  const isClearDialogOpen = useAppStore((s) => s.isClearDialogOpen);
  const showFireworks = useAppStore((s) => s.showFireworks);

  // --- 保存表相关 ---
  const savedTablesDrawerOpen = useAppStore((s) => s.savedTablesDrawerOpen);

  // --- 对话框开关 ---
  const isSaveDialogOpen = useAppStore((s) => s.dialogs.save);
  const isRenameDialogOpen = useAppStore((s) => s.dialogs.rename);
  const isDeleteDialogOpen = useAppStore((s) => s.dialogs.delete);
  const isDiffDialogOpen = useAppStore((s) => s.isDiffDialogOpen);
  const versionHistoryTarget = useAppStore((s) => s.versionHistoryTarget);
  const isReviewHistoryOpen = useAppStore((s) => s.isReviewHistoryOpen);
  const isStorageEstimatorOpen = useAppStore((s) => s.isStorageEstimatorOpen);
  const isAIGenerateDialogOpen = useAppStore((s) => s.isAIGenerateDialogOpen);
  const isMockDataDialogOpen = useAppStore((s) => s.isMockDataDialogOpen);
  const timelinePlayerTarget = useAppStore((s) => s.timelinePlayerTarget);

  // --- 其余 store 的状态值 ---
  const rows = useFieldStore((s) => s.rows);
  const indexInput = useIndexStore((s) => s.indexInput);
  const currentIndexFields = useIndexStore((s) => s.currentIndexFields);
  const indexes = useIndexStore((s) => s.indexes);
  const foreignKeys = useForeignKeyStore((s) => s.foreignKeys);

  return {
    // 基础表配置
    schemaName,
    tableName,
    tableComment,
    objectType,
    viewDefinition,
    viewCreateOrReplace,
    dbType,
    sqlFormatMode,
    setSchemaName,
    setTableName,
    setTableComment,
    setObjectType,
    setViewDefinition,
    setViewCreateOrReplace,
    setDbType,
    setSqlFormatMode,
    addCount,
    setAddCount,
    activeTab,
    setActiveTab,
    resetTableConfig,
    resetTableViewConfig,
    // 冻结列
    fieldTableFreezeEnabled,
    setFieldTableFreezeEnabled,
    fieldTableFreezeColumns,
    setFieldTableFreezeColumns,
    // 全局 UI
    isClearDialogOpen,
    setIsClearDialogOpen,
    showFireworks,
    setShowFireworks,
    // 保存表
    savedTablesDrawerOpen,
    setSavedTablesDrawerOpen,
    // 对话框
    isSaveDialogOpen,
    setIsSaveDialogOpen,
    isRenameDialogOpen,
    setIsRenameDialogOpen,
    isDeleteDialogOpen,
    setIsDeleteDialogOpen,
    isDiffDialogOpen,
    setIsDiffDialogOpen,
    versionHistoryTarget,
    setVersionHistoryTarget,
    isReviewHistoryOpen,
    setIsReviewHistoryOpen,
    isStorageEstimatorOpen,
    setIsStorageEstimatorOpen,
    isAIGenerateDialogOpen,
    setIsAIGenerateDialogOpen,
    isMockDataDialogOpen,
    setIsMockDataDialogOpen,
    timelinePlayerTarget,
    setTimelinePlayerTarget,
    // Field store
    rows,
    setRows,
    initializeRows,
    resetTableRows,
    // Index store
    indexInput,
    currentIndexFields,
    indexes,
    setIndexInput,
    setCurrentIndexFields,
    initializeIndexState,
    updateIndexNames,
    resetIndexState,
    setIndexes,
    // ForeignKey store
    foreignKeys,
    setForeignKeys,
    initializeForeignKeyState,
    resetForeignKeyState,
    addForeignKey,
    removeForeignKey,
    updateForeignKey,
    syncForeignKeyFieldRename,
  };
}
