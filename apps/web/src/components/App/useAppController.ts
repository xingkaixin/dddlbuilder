import { useCallback, useMemo } from 'react';
import type { DatabaseType, PersistedState } from '@ddlbuilder/shared-types';
import { isTabAvailable } from '@/utils/tabUtils';
import { useAppSelectors } from './hooks/useAppSelectors';
import { useDialogStates } from './hooks/useDialogStates';
import { useDerivedTableState } from './hooks/useDerivedTableState';
import { useFolderActions } from './hooks/useFolderActions';
import { useTemplateActions } from './hooks/useTemplateActions';
import { useTableTemplateActions } from './hooks/useTableTemplateActions';
import { useSchemaApplyActions } from './hooks/useSchemaApplyActions';
import { useSavedTableFlowActions } from './hooks/useSavedTableFlowActions';
import { useTabLifecycle } from './hooks/useTabLifecycle';
import { usePersistedSync } from './hooks/usePersistedSync';
import { applySavedState } from './applySavedState';
import { useClearAllActions } from './hooks/useClearAllActions';
import { useReviewActions } from './hooks/useReviewActions';
import { useShareAction } from './hooks/useShareAction';
import { useNavigationActions } from './hooks/useNavigationActions';
import { useTemplateToolbarLeft } from './hooks/useTemplateToolbarLeft';
import { useFireworksIntro } from './hooks/useFireworksIntro';
import { useIndexAdvisorFlow } from './hooks/useIndexAdvisorFlow';
import { useAISchemaPatchFlow } from './hooks/useAISchemaPatchFlow';
import { useAICommentActions } from './hooks/useAICommentActions';
import { useLoadedTablePresentation } from './hooks/useLoadedTablePresentation';
import { useSavedTableTabIntegration } from './hooks/useSavedTableTabIntegration';
import { useWorkspaceNotifications } from './hooks/useWorkspaceNotifications';
import { useWorkspaceTabActions } from './hooks/useWorkspaceTabActions';
import { useWorkspaceTrashActions } from './hooks/useWorkspaceTrashActions';
import { useWorkspacePresentation } from './hooks/useWorkspacePresentation';
import { usePersistedState } from '@/hooks/usePersistedState';
import { useAuthManagement } from '@/hooks/useAuthManagement';
import { useSqlGeneration } from '@/hooks/useSqlGeneration';
import { useOrmGeneration } from '@/hooks/useOrmGeneration';
import { useToast } from '@/hooks/useToast';
import { useCitusSharding } from '@/hooks/useCitusSharding';
import { useMysqlPartition } from '@/hooks/useMysqlPartition';
import { useTableOptions } from '@/hooks/useTableOptions';
import { useDDLReview } from '@/hooks/useDDLReview';
import { useSuggestionAnimation } from '@/hooks/useSuggestionAnimation';
import { useSavedTables } from '@/hooks/useSavedTables';
import { useFolders } from '@/hooks/useFolders';
import { useWorkspaceScope } from '@/hooks/useWorkspaceScope';
import { useFieldTemplates } from '@/hooks/useFieldTemplates';
import { useTableTemplates } from '@/hooks/useTableTemplates';
import { lintSchema } from '@/utils/schemaLint';
import { buildQualifiedTableName } from '@ddlbuilder/ddl-core';
import { useTranslation } from 'react-i18next';

import { isCnyFireworksEnabled } from '@/config/featureFlags';

export function useAppController() {
  const { t } = useTranslation();
  const workspaceScope = useWorkspaceScope();

  const editor = useAppSelectors();
  const {
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
    setDbType,
    addCount,
    activeTab,
    setActiveTab,
    resetTableConfig,
    resetTableViewConfig,
    fieldTableFreezeEnabled,
    fieldTableFreezeColumns,
    setIsClearDialogOpen,
    setShowFireworks,
    setSavedTablesDrawerOpen,
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
    rows,
    setRows,
    resetTableRows,
    indexInput,
    currentIndexFields,
    indexes,
    setIndexInput,
    updateIndexNames,
    resetIndexState,
    setIndexes,
    foreignKeys,
    setForeignKeys,
  } = editor;

  const {
    saveDialog,
    renameDialog,
    deleteDialog,
    saveName,
    saveError,
    renameName,
    renameError,
    deleteTarget,
    handleSaveNameChange,
    handleRenameNameChange,
  } = useDialogStates({
    isSaveDialogOpen,
    setIsSaveDialogOpen,
    isRenameDialogOpen,
    setIsRenameDialogOpen,
    isDeleteDialogOpen,
    setIsDeleteDialogOpen,
  });

  const { handleFireworksComplete } = useFireworksIntro({
    enabled: isCnyFireworksEnabled,
    setShowFireworks,
  });
  const handlePlayFireworks = useCallback(() => {
    if (!isCnyFireworksEnabled) {
      return;
    }
    setShowFireworks(true);
  }, [setShowFireworks]);

  const {
    persistedState,
    hydrated,
    saveState,
    clearState,
    shareLoadStatus,
    isShareView,
    activeSource,
    draftSummaries,
    getDraftState,
    setWorkspaceSnapshot,
    selectWorkspaceSnapshot,
    createDraft,
    deleteDraftById,
    moveDraftToFolder,
    getSavedTableDraft,
    removeSavedTableDraft,
    renameSavedTableDraft,
    trashedDrafts,
    restoreDraftById,
    permanentlyDeleteDraftById,
    persistenceFailure,
    retryPersistence,
  } = usePersistedState();
  const loadedTableSource = activeSource.kind === 'saved_table' ? activeSource : null;
  const loadedTableNormalizedName = loadedTableSource?.normalizedName ?? null;
  const loadedTableName = loadedTableSource?.tableName ?? null;
  const loadedTableSignature = loadedTableSource?.baseSignature ?? null;

  const auth = useAuthManagement();
  const { authInput, authObjects, setAuthInput, resetAuthState, setAuthObjects } = auth;

  const sharding = useCitusSharding();
  const { citusShardingConfig, resetCitusSharding } = sharding;

  const animations = useSuggestionAnimation();
  const { triggerIndexAnimation, triggerFieldTableHighlight } = animations;

  const partition = useMysqlPartition();
  const { mysqlPartitionConfig, setMysqlPartitionConfig, resetPartition } = partition;

  const tableOptions = useTableOptions();
  const { tableMiscConfig, setTableMiscConfig, resetTableMiscConfig } = tableOptions;

  const qualifiedTableName = useMemo(
    () => buildQualifiedTableName(schemaName, tableName),
    [schemaName, tableName],
  );

  const {
    normalizedFields,
    availableFields,
    filledRowCount,
    supportsMysqlPartition,
    currentPersistedState,
    buildPersistedState,
    serializePersistedState,
    hasLoadedTable,
    isLoadedDirty,
    canSaveCurrent,
    saveDialogTitle,
    saveDialogDescription,
    saveInputDisabled,
    tableDiff,
  } = useDerivedTableState({
    objectType,
    schemaName,
    tableName,
    tableComment,
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
  });
  const { setLoadedTableVersion, workspaceLabel } = useLoadedTablePresentation({
    hydrated,
    isShareView,
    normalizedName: loadedTableNormalizedName,
    tableName: loadedTableName,
    isDirty: isLoadedDirty,
  });

  const tabLifecycle = useTabLifecycle({
    enabled: hydrated && !isShareView,
    currentState: currentPersistedState,
    activeSource,
    serializePersistedState,
    saveState,
    selectWorkspaceSnapshot,
  });
  const {
    tabs,
    activeTabId,
    activeWorkspaceTab,
    getActiveTab,
    updateActiveTabTitle,
    switchToTabById,
    closeTab: handleCloseTab,
  } = tabLifecycle;

  const { generatedSql, generatedDcl, copySql, copyDcl } = useSqlGeneration(
    objectType,
    dbType,
    schemaName,
    tableName,
    tableComment,
    viewDefinition,
    viewCreateOrReplace,
    normalizedFields,
    indexes,
    authObjects,
    sqlFormatMode,
    dbType === 'postgresql-citus' ? citusShardingConfig : undefined,
    supportsMysqlPartition ? mysqlPartitionConfig : undefined,
    tableMiscConfig,
    foreignKeys,
  );
  const { generatedOrm, copyOrm, ormTarget, setOrmTarget } = useOrmGeneration(
    qualifiedTableName,
    tableComment,
    normalizedFields,
    indexes,
    foreignKeys,
  );

  const { showToast } = useToast();
  const aiCommentActions = useAICommentActions({
    schemaName,
    tableName,
    tableComment,
    rows,
    setTableComment,
    setRows,
  });
  const indexAdvisor = useIndexAdvisorFlow({
    dbType,
    schemaName,
    tableName,
    tableComment,
    fields: normalizedFields,
    indexes,
    setIndexes,
    setActiveTab,
  });

  useWorkspaceNotifications({
    shareLoadStatus,
    hydrated,
    isShareView,
    persistenceFailure,
    retryPersistence,
  });

  const savedTableData = useSavedTables();
  const {
    savedTables,
    trashedTables,
    saveTable,
    overwriteTable,
    deleteTable,
    restoreTable,
    deleteTablePermanently,
    renameTable,
    loadTable,
    moveTableToFolder,
    clearTablesFromFolders,
  } = savedTableData;

  const folderData = useFolders();
  const {
    folderTree,
    createFolder,
    renameFolder,
    moveFolder,
    deleteFolder: deleteFolderAction,
  } = folderData;

  const fieldTemplateData = useFieldTemplates();
  const {
    templates,
    loading: templatesLoading,
    createFromFields: createTemplateFromFields,
  } = fieldTemplateData;

  const tableTemplateData = useTableTemplates();
  const {
    templates: tableTemplates,
    loading: tableTemplatesLoading,
    create: createTableTemplate,
  } = tableTemplateData;

  const folderActions = useFolderActions({
    folderTree,
    savedTables,
    createFolder,
    renameFolder,
    moveFolder,
    deleteFolderAction,
    clearTablesFromFolders,
    deleteTable,
    moveTableToFolder,
    showToast,
  });
  const templateActions = useTemplateActions({
    rows,
    setRows,
    createTemplateFromFields,
    showToast,
  });
  const { handleManageTemplates, handleApplyTemplate, handleSaveAsTemplate } = templateActions;

  const reviewState = useDDLReview();
  const {
    isLoading: isReviewing,
    result: reviewResult,
    startReview,
    setReviewResult,
  } = reviewState;

  const reviewActions = useReviewActions({
    dbType,
    tableName: qualifiedTableName,
    generatedSql,
    loadedTableNormalizedName,
    isReviewing,
    reviewResult,
    startReview,
    setIsReviewHistoryOpen,
  });

  const schemaLintIssues = useMemo(
    () => lintSchema({ tableName, rows, indexes }),
    [tableName, rows, indexes],
  );

  const shareAction = useShareAction({
    buildPersistedState,
    showToast,
  });

  usePersistedSync({
    hydrated,
    hasOpenTab: tabs.length > 0,
    persistedState,
    activeSource,
    saveState,
    currentState: currentPersistedState,
    applyPersistedState: applySavedState,
  });

  const clearActions = useClearAllActions({
    setIsClearDialogOpen,
    clearState,
    resetTableConfig,
    resetTableViewConfig,
    resetTableRows,
    resetIndexState,
    resetAuthState,
    resetCitusSharding,
    resetPartition,
    resetTableMiscConfig,
  });

  const savedTableTabIntegration = useSavedTableTabIntegration({
    isShareView,
    workspaceScope,
    activeSource,
    deleteDraftById,
    removeSavedTableDraft,
    buildPersistedState,
    tabs: tabLifecycle,
  });

  const savedTableFlow = useSavedTableFlowActions({
    tableName,
    hasLoadedTable,
    canSaveCurrent,
    loadedTableSource,
    setLoadedTableVersion,
    saveDialog,
    renameDialog,
    deleteDialog,
    buildPersistedState,
    serializePersistedState,
    applySavedState,
    loadTable,
    renameTable,
    deleteTable,
    saveTable,
    overwriteTable,
    showToast,
    getSavedTableDraft,
    setWorkspaceSnapshot,
    renameSavedTableDraft,
    removeSavedTableDraft,
    ...savedTableTabIntegration,
  });
  const { handleOpenSaveDialog, handleConfirmSave, handleLoadSavedTable } = savedTableFlow;

  const handleSaveCurrent = useCallback(() => {
    if (hasLoadedTable) {
      void handleConfirmSave();
      return;
    }
    handleOpenSaveDialog();
  }, [hasLoadedTable, handleConfirmSave, handleOpenSaveDialog]);

  const workspaceTabs = useWorkspaceTabActions({
    tabs: tabLifecycle,
    setSavedTablesDrawerOpen,
    buildPersistedState,
    loadSavedTable: handleLoadSavedTable,
    draftSummaries,
    getDraftState,
    selectWorkspaceSnapshot,
    setWorkspaceSnapshot,
    createDraft,
    deleteDraftById,
  });
  const { openStateInNewDraftTab } = workspaceTabs;

  const tableTemplateActions = useTableTemplateActions({
    currentState: currentPersistedState,
    applyState: openStateInNewDraftTab,
    createTemplate: createTableTemplate,
    showToast,
  });
  const {
    handleManageTemplates: handleManageTableTemplates,
    handleSaveAsTemplate: handleSaveAsTableTemplate,
    handleApplyTemplate: handleApplyTableTemplate,
  } = tableTemplateActions;

  const trashActions = useWorkspaceTrashActions({
    folderTree,
    trashedTables,
    trashedDrafts,
    restoreTable,
    restoreDraftById,
    deleteTablePermanently,
    permanentlyDeleteDraftById,
  });
  const aiPatchFlow = useAISchemaPatchFlow({
    currentState: currentPersistedState,
    applyState: applySavedState,
    setActiveTab,
    highlightField: triggerFieldTableHighlight,
    animateIndex: triggerIndexAnimation,
  });

  const schemaActions = useSchemaApplyActions({
    rows,
    indexes,
    reviewResult,
    setRows,
    setIndexes,
    setForeignKeys,
    setReviewResult,
    setIndexInput,
    setAuthObjects,
    setAuthInput,
    setSchemaName,
    setTableName,
    setTableComment,
    setDbType,
    dbType,
    sqlFormatMode,
    setTableMiscConfig,
    setMysqlPartitionConfig,
    setActiveTab,
    triggerIndexAnimation,
    triggerFieldTableHighlight,
    showToast,
    onApplyAIGeneratedState: openStateInNewDraftTab,
  });

  const navigationActions = useNavigationActions({
    setSavedTablesDrawerOpen,
    setIsDiffDialogOpen,
    setActiveTab,
    setIsStorageEstimatorOpen,
    setVersionHistoryTarget,
    setIsAIGenerateDialogOpen,
    setIsMockDataDialogOpen,
  });
  const { handleViewVersionHistory } = navigationActions;

  const handleViewCurrentVersionHistory = useCallback(() => {
    if (!loadedTableNormalizedName || !loadedTableName) return;
    handleViewVersionHistory({
      normalizedName: loadedTableNormalizedName,
      name: loadedTableName,
      dbType,
      fieldCount: filledRowCount,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }, [
    loadedTableNormalizedName,
    loadedTableName,
    handleViewVersionHistory,
    dbType,
    filledRowCount,
  ]);

  const handleSelectTableFromEr = useCallback(
    (state: PersistedState) => {
      openStateInNewDraftTab(state);
      showToast(t('erDiagram.tableLoaded'));
    },
    [openStateInNewDraftTab, showToast, t],
  );

  const handleCopyDiff = useCallback(() => {
    showToast(t('app.copyDiffDone'));
  }, [showToast, t]);

  const handleRollbackVersion = useCallback(
    (state: PersistedState) => {
      applySavedState(state);
      setSavedTablesDrawerOpen(false);
      showToast(t('app.rollbackDone'));
    },
    [setSavedTablesDrawerOpen, showToast, t],
  );

  const aiGenerateExistingConfig = useMemo(
    () => ({ schemaName, tableName, tableComment, rows, indexes }),
    [schemaName, tableName, tableComment, rows, indexes],
  );

  const aiGenerateTemplates = useMemo(
    () => [...templates, ...tableTemplates],
    [templates, tableTemplates],
  );

  const handleDbTypeChange = useCallback(
    (newDbType: DatabaseType) => {
      setDbType(newDbType);
      if (!isTabAvailable(activeTab, newDbType)) {
        setActiveTab('fields');
      }
    },
    [setDbType, activeTab, setActiveTab],
  );

  const handleTableNameChange = useCallback(
    (value: string) => {
      setTableName(value);
      const currentTab = getActiveTab();
      if (currentTab?.source.kind === 'draft') {
        const newTitle = value.trim() || t('app.workspace.globalDraft');
        updateActiveTabTitle(newTitle);
      }
    },
    [setTableName, getActiveTab, updateActiveTabTitle, t],
  );

  const dataTableToolbarLeft = useTemplateToolbarLeft({
    templates,
    templatesLoading,
    handleApplyTemplate,
    handleManageTemplates,
    handleSaveAsTemplate,
    tableTemplates,
    tableTemplatesLoading,
    handleApplyTableTemplate,
    handleManageTableTemplates,
    handleSaveAsTableTemplate,
  });

  const {
    presentedTabs,
    recentDrafts,
    recentTables,
    tablePresentations,
    shouldShowWorkspaceSkeleton,
  } = useWorkspacePresentation({
    activeSourceKind: activeSource.kind,
    activeTabId,
    activeWorkspaceTab,
    draftSummaries,
    hydrated,
    isLoadedDirty,
    isShareView,
    savedTables,
    tabs,
  });

  return {
    actions: {
      aiCommentActions,
      indexAdvisor,
      folderActions,
      templateActions,
      reviewActions,
      shareAction,
      clearActions,
      savedTableFlow,
      workspaceTabs,
      tableTemplateActions,
      trashActions,
      aiPatchFlow,
      schemaActions,
      navigationActions,
    },
    domains: {
      editor,
      auth,
      sharding,
      animations,
      partition,
      tableOptions,
      reviewState,
    },
    resources: {
      savedTableData,
      folderData,
      fieldTemplateData,
      tableTemplateData,
    },
    workspace: {
      activeSource,
      activeTabId,
      draftSummaries,
      handleCloseTab,
      isLoadedDirty,
      isShareView,
      loadedTableName,
      loadedTableNormalizedName,
      moveDraftToFolder,
      presentedTabs,
      recentDrafts,
      recentTables,
      shouldShowWorkspaceSkeleton,
      switchToTabById,
      tablePresentations,
      tabs,
      trashedDrafts,
      workspaceLabel,
      workspaceScope,
    },
    schema: {
      aiGenerateExistingConfig,
      aiGenerateTemplates,
      availableFields,
      canSaveCurrent,
      currentPersistedState,
      dataTableToolbarLeft,
      filledRowCount,
      handleDbTypeChange,
      handleSaveCurrent,
      handleTableNameChange,
      handleViewCurrentVersionHistory,
      normalizedFields,
      qualifiedTableName,
      schemaLintIssues,
      tableDiff,
    },
    output: {
      copyDcl,
      copyOrm,
      copySql,
      generatedDcl,
      generatedOrm,
      generatedSql,
      ormTarget,
      setOrmTarget,
    },
    dialogs: {
      deleteTarget,
      handleCopyDiff,
      handleRenameNameChange,
      handleRollbackVersion,
      handleSaveNameChange,
      handleSelectTableFromEr,
      renameError,
      renameName,
      saveDialog,
      saveDialogDescription,
      saveDialogTitle,
      saveError,
      saveInputDisabled,
      saveName,
    },
    celebration: {
      handleFireworksComplete,
      handlePlayFireworks,
    },
  };
}
