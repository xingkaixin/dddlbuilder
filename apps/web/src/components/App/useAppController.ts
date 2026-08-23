import { useCallback, useMemo } from 'react';
import type { DatabaseType, PersistedState } from '@ddlbuilder/shared-types';
import { isTabAvailable } from '@/utils/tabUtils';
import { useEditorDomains } from './hooks/useEditorDomains';
import { useWorkspaceController } from './hooks/useWorkspaceController';
import { useDialogStates } from './hooks/useDialogStates';
import { useSchemaController } from './hooks/useSchemaController';
import { useFolderActions } from './hooks/useFolderActions';
import { useTemplateActions } from './hooks/useTemplateActions';
import { useTableTemplateActions } from './hooks/useTableTemplateActions';
import { useSchemaApplyActions } from './hooks/useSchemaApplyActions';
import { useSavedTableFlowActions } from './hooks/useSavedTableFlowActions';
import { useTabLifecycle } from './hooks/useTabLifecycle';
import { usePersistedSync } from './hooks/usePersistedSync';
import { applySavedState } from './applySavedState';
import { useClearAllActions } from './hooks/useClearAllActions';
import { useNavigationActions } from './hooks/useNavigationActions';
import { useTemplateToolbarLeft } from './hooks/useTemplateToolbarLeft';
import { useFireworksIntro } from './hooks/useFireworksIntro';
import { useAISchemaPatchFlow } from './hooks/useAISchemaPatchFlow';
import { useSavedTableTabIntegration } from './hooks/useSavedTableTabIntegration';
import { useWorkspaceTabActions } from './hooks/useWorkspaceTabActions';
import { useWorkspaceTrashActions } from './hooks/useWorkspaceTrashActions';
import { useWorkspacePresentation } from './hooks/useWorkspacePresentation';
import { useFieldTemplates } from '@/hooks/useFieldTemplates';
import { useTableTemplates } from '@/hooks/useTableTemplates';
import { useTranslation } from 'react-i18next';

import { isCnyFireworksEnabled } from '@/config/featureFlags';

export function useAppController() {
  const { t } = useTranslation();
  const { editor, auth, sharding, animations, partition, tableOptions } = useEditorDomains();
  const {
    persistence,
    savedTableData,
    folderData,
    workspaceScope,
    loadedTableSource,
    loadedTableNormalizedName,
    loadedTableName,
    loadedTableSignature,
  } = useWorkspaceController();
  const {
    schemaName,
    tableName,
    tableComment,
    dbType,
    setTableName,
    setDbType,
    activeTab,
    setActiveTab,
    resetTableConfig,
    resetTableViewConfig,
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
    setIsStorageEstimatorOpen,
    setIsAIGenerateDialogOpen,
    setIsMockDataDialogOpen,
    rows,
    setRows,
    resetTableRows,
    indexes,
    resetIndexState,
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
    isShareView,
    activeSource,
    draftSummaries,
    getDraftState,
    resolveWorkspaceSnapshot,
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
  } = persistence;
  const { resetAuthState } = auth;

  const { resetCitusSharding } = sharding;

  const { triggerIndexAnimation, triggerFieldTableHighlight } = animations;

  const { resetPartition } = partition;

  const { resetTableMiscConfig } = tableOptions;

  const schemaController = useSchemaController({
    domains: { editor, auth, sharding, animations, partition, tableOptions },
    hydrated,
    isShareView,
    loadedTableNormalizedName,
    loadedTableName,
    loadedTableSignature,
  });
  const {
    normalizedFields,
    availableFields,
    filledRowCount,
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
  } = schemaController.derived;
  const { setLoadedTableVersion, workspaceLabel } = schemaController.loadedPresentation;
  const { generatedSql, generatedDcl, copySql, copyDcl } = schemaController.sql;
  const { generatedOrm, copyOrm, ormTarget, setOrmTarget } = schemaController.orm;
  const {
    aiCommentActions,
    indexAdvisor,
    reviewState,
    reviewActions,
    schemaLintIssues,
    shareAction,
    qualifiedTableName,
    showToast,
  } = schemaController;
  const { result: reviewResult, setReviewResult } = reviewState;

  const tabLifecycle = useTabLifecycle({
    enabled: hydrated && !isShareView,
    currentState: currentPersistedState,
    activeSource,
    serializePersistedState,
    saveState,
    selectWorkspaceSnapshot,
    resolveWorkspaceSnapshot,
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
  const { handleOpenSaveDialog, handleConfirmSave, resolveSavedTable } = savedTableFlow;

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
    loadSavedTable: resolveSavedTable,
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
    currentState: currentPersistedState,
    reviewResult,
    setReviewResult,
    replaceCurrentState: applySavedState,
    openGeneratedState: openStateInNewDraftTab,
    setActiveTab,
    triggerIndexAnimation,
    triggerFieldTableHighlight,
    showToast,
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

export type AppController = ReturnType<typeof useAppController>;
export type AppActions = AppController['actions'];
export type AppDomains = AppController['domains'];
export type AppResources = AppController['resources'];
export type AppWorkspaceState = AppController['workspace'];
export type AppSchema = AppController['schema'];
export type AppOutput = AppController['output'];
export type AppDialogs = AppController['dialogs'];
export type AppCelebration = AppController['celebration'];
