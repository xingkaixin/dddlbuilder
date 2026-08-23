import { useEditorStore } from '@/stores';

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
  } = useEditorStore.getState();

  const { setRows, initializeRows, resetRows: resetTableRows } = useEditorStore.getState();

  const {
    setIndexInput,
    setCurrentIndexFields,
    initializeIndexState,
    updateIndexNames,
    resetIndexState,
    setIndexes,
  } = useEditorStore.getState();

  const {
    setForeignKeys,
    initializeForeignKeyState,
    resetForeignKeyState,
    addForeignKey,
    removeForeignKey,
    updateForeignKey,
    syncForeignKeyFieldRename,
  } = useEditorStore.getState();

  // --- 基础表配置 ---
  const schemaName = useEditorStore((s) => s.schemaName);
  const tableName = useEditorStore((s) => s.tableName);
  const tableComment = useEditorStore((s) => s.tableComment);
  const objectType = useEditorStore((s) => s.objectType);
  const viewDefinition = useEditorStore((s) => s.viewDefinition);
  const viewCreateOrReplace = useEditorStore((s) => s.viewCreateOrReplace);
  const dbType = useEditorStore((s) => s.dbType);
  const sqlFormatMode = useEditorStore((s) => s.sqlFormatMode);
  const addCount = useEditorStore((s) => s.addCount);
  const activeTab = useEditorStore((s) => s.activeTab);

  // --- 冻结列配置 ---
  const fieldTableFreezeEnabled = useEditorStore((s) => s.fieldTableFreezeEnabled);
  const fieldTableFreezeColumns = useEditorStore((s) => s.fieldTableFreezeColumns);

  // --- 全局 UI 状态 ---
  const showFireworks = useEditorStore((s) => s.showFireworks);

  // --- 保存表相关 ---
  const savedTablesDrawerOpen = useEditorStore((s) => s.savedTablesDrawerOpen);

  // --- 对话框开关 ---
  const isSaveDialogOpen = useEditorStore((s) => s.dialogs.save);
  const isRenameDialogOpen = useEditorStore((s) => s.dialogs.rename);
  const isDeleteDialogOpen = useEditorStore((s) => s.dialogs.delete);

  // --- 其余 store 的状态值 ---
  const rows = useEditorStore((s) => s.rows);
  const indexInput = useEditorStore((s) => s.indexInput);
  const currentIndexFields = useEditorStore((s) => s.currentIndexFields);
  const indexes = useEditorStore((s) => s.indexes);
  const foreignKeys = useEditorStore((s) => s.foreignKeys);

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
    setIsDiffDialogOpen,
    setVersionHistoryTarget,
    setIsReviewHistoryOpen,
    setIsStorageEstimatorOpen,
    setIsAIGenerateDialogOpen,
    setIsMockDataDialogOpen,
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
