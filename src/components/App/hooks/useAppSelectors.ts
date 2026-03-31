import { useAppStore, useFieldStore, useIndexStore } from '@/stores';

/**
 * 聚合 App 组件所需的所有 zustand selector，按功能分组。
 * 从 App/index.tsx 中提取，减少主组件中的样板代码。
 */
export function useAppSelectors() {
  // --- 基础表配置 ---
  const tableName = useAppStore((s) => s.tableName);
  const tableComment = useAppStore((s) => s.tableComment);
  const dbType = useAppStore((s) => s.dbType);
  const setTableName = useAppStore((s) => s.setTableName);
  const setTableComment = useAppStore((s) => s.setTableComment);
  const setDbType = useAppStore((s) => s.setDbType);
  const addCount = useAppStore((s) => s.addCount);
  const setAddCount = useAppStore((s) => s.setAddCount);
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const resetTableConfig = useAppStore((s) => s.resetTableConfig);
  const resetTableViewConfig = useAppStore((s) => s.resetTableViewConfig);

  // --- 冻结列配置 ---
  const fieldTableFreezeEnabled = useAppStore((s) => s.fieldTableFreezeEnabled);
  const setFieldTableFreezeEnabled = useAppStore((s) => s.setFieldTableFreezeEnabled);
  const fieldTableFreezeColumns = useAppStore((s) => s.fieldTableFreezeColumns);
  const setFieldTableFreezeColumns = useAppStore((s) => s.setFieldTableFreezeColumns);

  // --- 全局 UI 状态 ---
  const isClearDialogOpen = useAppStore((s) => s.isClearDialogOpen);
  const setIsClearDialogOpen = useAppStore((s) => s.setIsClearDialogOpen);
  const showFireworks = useAppStore((s) => s.showFireworks);
  const setShowFireworks = useAppStore((s) => s.setShowFireworks);

  // --- 保存表相关 ---
  const savedTablesDrawerOpen = useAppStore((s) => s.savedTablesDrawerOpen);
  const setSavedTablesDrawerOpen = useAppStore((s) => s.setSavedTablesDrawerOpen);
  const loadedTableNormalizedName = useAppStore((s) => s.loadedTableNormalizedName);
  const setLoadedTableNormalizedName = useAppStore((s) => s.setLoadedTableNormalizedName);
  const loadedTableName = useAppStore((s) => s.loadedTableName);
  const setLoadedTableName = useAppStore((s) => s.setLoadedTableName);
  const loadedTableSignature = useAppStore((s) => s.loadedTableSignature);
  const setLoadedTableSignature = useAppStore((s) => s.setLoadedTableSignature);

  // --- 对话框开关 ---
  const isSaveDialogOpen = useAppStore((s) => s.dialogs.save);
  const setIsSaveDialogOpen = useAppStore((s) => s.setIsSaveDialogOpen);
  const isRenameDialogOpen = useAppStore((s) => s.dialogs.rename);
  const setIsRenameDialogOpen = useAppStore((s) => s.setIsRenameDialogOpen);
  const isDeleteDialogOpen = useAppStore((s) => s.dialogs.delete);
  const setIsDeleteDialogOpen = useAppStore((s) => s.setIsDeleteDialogOpen);
  const isLoadConfirmOpen = useAppStore((s) => s.dialogs.loadConfirm);
  const setIsLoadConfirmOpen = useAppStore((s) => s.setIsLoadConfirmOpen);
  const isDiffDialogOpen = useAppStore((s) => s.isDiffDialogOpen);
  const setIsDiffDialogOpen = useAppStore((s) => s.setIsDiffDialogOpen);
  const isVersionHistoryOpen = useAppStore((s) => s.isVersionHistoryOpen);
  const setIsVersionHistoryOpen = useAppStore((s) => s.setIsVersionHistoryOpen);
  const versionHistoryTarget = useAppStore((s) => s.versionHistoryTarget);
  const setVersionHistoryTarget = useAppStore((s) => s.setVersionHistoryTarget);
  const isReviewHistoryOpen = useAppStore((s) => s.isReviewHistoryOpen);
  const setIsReviewHistoryOpen = useAppStore((s) => s.setIsReviewHistoryOpen);
  const isStorageEstimatorOpen = useAppStore((s) => s.isStorageEstimatorOpen);
  const setIsStorageEstimatorOpen = useAppStore((s) => s.setIsStorageEstimatorOpen);
  const isAIGenerateDialogOpen = useAppStore((s) => s.isAIGenerateDialogOpen);
  const setIsAIGenerateDialogOpen = useAppStore((s) => s.setIsAIGenerateDialogOpen);

  // --- Field store ---
  const rows = useFieldStore((s) => s.rows);
  const setRows = useFieldStore((s) => s.setRows);
  const initializeRows = useFieldStore((s) => s.initializeRows);
  const resetTableRows = useFieldStore((s) => s.resetRows);

  // --- Index store ---
  const indexInput = useIndexStore((s) => s.indexInput);
  const currentIndexFields = useIndexStore((s) => s.currentIndexFields);
  const indexes = useIndexStore((s) => s.indexes);
  const setIndexInput = useIndexStore((s) => s.setIndexInput);
  const setCurrentIndexFields = useIndexStore((s) => s.setCurrentIndexFields);
  const initializeIndexState = useIndexStore((s) => s.initializeIndexState);
  const updateIndexNames = useIndexStore((s) => s.updateIndexNames);
  const resetIndexState = useIndexStore((s) => s.resetIndexState);
  const setIndexes = useIndexStore((s) => s.setIndexes);

  return {
    // 基础表配置
    tableName,
    tableComment,
    dbType,
    setTableName,
    setTableComment,
    setDbType,
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
    loadedTableNormalizedName,
    setLoadedTableNormalizedName,
    loadedTableName,
    setLoadedTableName,
    loadedTableSignature,
    setLoadedTableSignature,
    // 对话框
    isSaveDialogOpen,
    setIsSaveDialogOpen,
    isRenameDialogOpen,
    setIsRenameDialogOpen,
    isDeleteDialogOpen,
    setIsDeleteDialogOpen,
    isLoadConfirmOpen,
    setIsLoadConfirmOpen,
    isDiffDialogOpen,
    setIsDiffDialogOpen,
    isVersionHistoryOpen,
    setIsVersionHistoryOpen,
    versionHistoryTarget,
    setVersionHistoryTarget,
    isReviewHistoryOpen,
    setIsReviewHistoryOpen,
    isStorageEstimatorOpen,
    setIsStorageEstimatorOpen,
    isAIGenerateDialogOpen,
    setIsAIGenerateDialogOpen,
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
  };
}
