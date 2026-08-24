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
import { useEditorSurfaceModel } from './hooks/useEditorSurfaceModel';
import { useFieldTemplates } from '@/hooks/useFieldTemplates';
import { useTableTemplates } from '@/hooks/useTableTemplates';
import { useTranslation } from 'react-i18next';

import { isCnyFireworksEnabled } from '@/config/featureFlags';

export function useAppController() {
  const { t } = useTranslation();
  const domains = useEditorDomains();
  const { editor, ui, auth, sharding, animations, partition, tableOptions } = domains;
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
    setTableName,
    setDbType,
    activeTab,
    setActiveTab,
    resetTableConfig,
    resetTableViewConfig,
    rows,
    setRows,
    resetTableRows,
    indexes,
    resetIndexState,
  } = editor;
  const {
    workspaceSidebarOpen,
    outputPanelOpen,
    setIsClearDialogOpen,
    setShowFireworks,
    setSavedTablesDrawerOpen,
    isImportDialogOpen,
    setIsImportDialogOpen,
    isErDialogOpen,
    setIsErDialogOpen,
    isAISchemaPatchOpen,
    setIsAISchemaPatchOpen,
    setWorkspaceSidebarOpen,
    setOutputPanelOpen,
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
  } = ui;

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
    resetWorkspaceSelection,
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
    domains: { editor, ui, auth, sharding, animations, partition, tableOptions },
    hydrated,
    isShareView,
    loadedTableNormalizedName,
    loadedTableName,
    loadedTableSignature,
  });
  const {
    normalizedFields,
    currentPersistedState,
    buildPersistedState,
    serializePersistedState,
    hasLoadedTable,
    isLoadedDirty,
    canSaveCurrent,
    saveInputDisabled,
    tableDiff,
  } = schemaController.derived;
  const { setLoadedTableVersion, workspaceLabel } = schemaController.loadedPresentation;
  const { indexAdvisor, reviewState, shareAction, showToast } = schemaController;
  const { result: reviewResult, setReviewResult } = reviewState;

  const tabLifecycle = useTabLifecycle({
    enabled: hydrated && !isShareView,
    getCurrentState: buildPersistedState,
    serializePersistedState,
    saveState,
    selectWorkspaceSnapshot,
    resolveWorkspaceSnapshot,
    resetWorkspaceSelection,
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
  const activeEditorSource = activeWorkspaceTab?.source ?? activeSource;
  const canSyncActiveTab = activeWorkspaceTab != null && !activeWorkspaceTab.isLoading;

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
    hasOpenTab: canSyncActiveTab,
    persistedState,
    activeSource: activeEditorSource,
    saveState,
    currentState: currentPersistedState,
    getCurrentState: buildPersistedState,
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
    activeSource: activeEditorSource,
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
    });
  }, [loadedTableNormalizedName, loadedTableName, handleViewVersionHistory]);

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

  const collapseSidebar = useCallback(
    () => setWorkspaceSidebarOpen(false),
    [setWorkspaceSidebarOpen],
  );
  const expandSidebar = useCallback(() => setWorkspaceSidebarOpen(true), [setWorkspaceSidebarOpen]);
  const openWorkspaceAfterImport = useCallback(
    () => setSavedTablesDrawerOpen(true),
    [setSavedTablesDrawerOpen],
  );
  const openImportDialog = useCallback(() => setIsImportDialogOpen(true), [setIsImportDialogOpen]);
  const openErDiagram = useCallback(() => setIsErDialogOpen(true), [setIsErDialogOpen]);
  const openAISchemaPatch = useCallback(() => {
    if (tabs.length === 0 && !isShareView) {
      navigationActions.handleOpenAIGenerateDialog();
      return;
    }
    setIsAISchemaPatchOpen(true);
  }, [isShareView, navigationActions, setIsAISchemaPatchOpen, tabs.length]);

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
    activeSourceKind: activeEditorSource.kind,
    activeTabId,
    activeWorkspaceTab,
    draftSummaries,
    hydrated,
    isLoadedDirty,
    isShareView,
    savedTables,
    tabs,
  });

  const editorSurface = useEditorSurfaceModel({
    domains,
    schemaController,
    clearActions,
    navigationActions,
    schemaActions,
    isShareView,
    outputPanelOpen,
    setOutputPanelOpen,
    isLoadedDirty,
    loadedTableName,
    loadedTableNormalizedName,
    workspaceLabel,
    dataTableToolbarLeft,
    onTableNameChange: handleTableNameChange,
    onDbTypeChange: handleDbTypeChange,
    onSaveCurrent: handleSaveCurrent,
    onViewCurrentVersionHistory: handleViewCurrentVersionHistory,
    onOpenErDiagram: openErDiagram,
    onOpenAISchemaPatch: openAISchemaPatch,
  });

  return {
    workspaceView: {
      actions: {
        folderActions: {
          handleMoveTableToFolder: folderActions.handleMoveTableToFolder,
          handleMoveFolderToFolder: folderActions.handleMoveFolderToFolder,
          handleOpenCreateFolderDialog: folderActions.handleOpenCreateFolderDialog,
          handleOpenRenameFolderDialog: folderActions.handleOpenRenameFolderDialog,
          handleOpenDeleteFolderDialog: folderActions.handleOpenDeleteFolderDialog,
        },
        shareAction: {
          handleShare: shareAction.handleShare,
          isSharing: shareAction.isSharing,
        },
        savedTableFlow: {
          handleOpenSaveDialog: savedTableFlow.handleOpenSaveDialog,
          handleOpenRenameDialog: savedTableFlow.handleOpenRenameDialog,
          handleOpenDeleteDialog: savedTableFlow.handleOpenDeleteDialog,
        },
        workspaceTabs: {
          handleSelectDraft: workspaceTabs.handleSelectDraft,
          handleDeleteDraft: workspaceTabs.handleDeleteDraft,
          handleSelectSavedTable: workspaceTabs.handleSelectSavedTable,
          handleCreateDraft: workspaceTabs.handleCreateDraft,
          handleLoadExample: workspaceTabs.handleLoadExample,
        },
        tableTemplateActions: {
          handleApplyTemplate: tableTemplateActions.handleApplyTemplate,
          handleManageTemplates: tableTemplateActions.handleManageTemplates,
          handleSaveAsTemplate: tableTemplateActions.handleSaveAsTemplate,
        },
        trashActions: {
          handleRestoreTable: trashActions.handleRestoreTable,
          handleDeleteTablePermanently: trashActions.handleDeleteTablePermanently,
          handleRestoreDraft: trashActions.handleRestoreDraft,
          handleDeleteDraftPermanently: trashActions.handleDeleteDraftPermanently,
          handleEmptyTrash: trashActions.handleEmptyTrash,
        },
        schemaActions: {
          handleImport: schemaActions.handleImport,
        },
        navigationActions: {
          handleOpenAIGenerateDialog: navigationActions.handleOpenAIGenerateDialog,
          handleOpenSavedTablesDrawer: navigationActions.handleOpenSavedTablesDrawer,
          handleViewVersionHistory: navigationActions.handleViewVersionHistory,
        },
      },
      ui: {
        currentDbType: editor.dbType,
        savedTablesDrawerOpen: ui.savedTablesDrawerOpen,
        setSavedTablesDrawerOpen: ui.setSavedTablesDrawerOpen,
        showFireworks: ui.showFireworks,
      },
      resources: {
        savedTableData: {
          savedTables: savedTableData.savedTables,
          trashedTables: savedTableData.trashedTables,
          loading: savedTableData.loading,
          error: savedTableData.error,
          importTables: savedTableData.importTables,
        },
        folderData: {
          folderTree: folderData.folderTree,
          loading: folderData.loading,
        },
        tableTemplateData: {
          templates: tableTemplateData.templates,
          loading: tableTemplateData.loading,
        },
      },
      workspace: {
        activeSource: activeEditorSource,
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
      },
      layout: {
        workspaceSidebarOpen,
        collapseSidebar,
        expandSidebar,
        openImportDialog,
        openWorkspaceAfterImport,
      },
      editorSurface,
      celebration: {
        handleFireworksComplete,
        handlePlayFireworks,
      },
    },
    dialogLayer: {
      actions: {
        indexAdvisor: {
          open: indexAdvisor.open,
          setDialogOpen: indexAdvisor.setDialogOpen,
          isLoading: indexAdvisor.isLoading,
          result: indexAdvisor.result,
          error: indexAdvisor.error,
          suggestedQuery: indexAdvisor.suggestedQuery,
          blockingMessage: indexAdvisor.blockingMessage,
          analyze: indexAdvisor.analyze,
          applyRecommendation: indexAdvisor.applyRecommendation,
        },
        folderActions: {
          isFolderDialogOpen: folderActions.isFolderDialogOpen,
          setIsFolderDialogOpen: folderActions.setIsFolderDialogOpen,
          folderDialogMode: folderActions.folderDialogMode,
          folderDialogParent: folderActions.folderDialogParent,
          folderDialogTarget: folderActions.folderDialogTarget,
          handleFolderDialogConfirm: folderActions.handleFolderDialogConfirm,
          isDeleteFolderDialogOpen: folderActions.isDeleteFolderDialogOpen,
          setIsDeleteFolderDialogOpen: folderActions.setIsDeleteFolderDialogOpen,
          deleteFolderTarget: folderActions.deleteFolderTarget,
          deleteFolderTableCount: folderActions.deleteFolderTableCount,
          handleDeleteFolderConfirm: folderActions.handleDeleteFolderConfirm,
        },
        templateActions: {
          isTemplateManagerOpen: templateActions.isTemplateManagerOpen,
          setIsTemplateManagerOpen: templateActions.setIsTemplateManagerOpen,
          isCreateTemplateDialogOpen: templateActions.isCreateTemplateDialogOpen,
          setIsCreateTemplateDialogOpen: templateActions.setIsCreateTemplateDialogOpen,
          selectedFieldsForTemplate: templateActions.selectedFieldsForTemplate,
          handleCreateTemplateFromFields: templateActions.handleCreateTemplateFromFields,
        },
        clearActions: {
          cancelClearAll: clearActions.cancelClearAll,
          confirmClearAll: clearActions.confirmClearAll,
        },
        savedTableFlow: {
          handleSaveDialogOpenChange: savedTableFlow.handleSaveDialogOpenChange,
          handleConfirmSave: savedTableFlow.handleConfirmSave,
          handleRenameDialogOpenChange: savedTableFlow.handleRenameDialogOpenChange,
          handleConfirmRename: savedTableFlow.handleConfirmRename,
          handleDeleteDialogOpenChange: savedTableFlow.handleDeleteDialogOpenChange,
          handleConfirmDelete: savedTableFlow.handleConfirmDelete,
        },
        tableTemplateActions: {
          isManagerOpen: tableTemplateActions.isManagerOpen,
          setIsManagerOpen: tableTemplateActions.setIsManagerOpen,
          isCreateDialogOpen: tableTemplateActions.isCreateDialogOpen,
          setIsCreateDialogOpen: tableTemplateActions.setIsCreateDialogOpen,
          pendingBlueprint: tableTemplateActions.pendingBlueprint,
          handleCreateTemplate: tableTemplateActions.handleCreateTemplate,
        },
        trashActions: {
          isEmptyTrashDialogOpen: trashActions.isEmptyTrashDialogOpen,
          setIsEmptyTrashDialogOpen: trashActions.setIsEmptyTrashDialogOpen,
          handleConfirmEmptyTrash: trashActions.handleConfirmEmptyTrash,
        },
        aiPatchFlow: {
          applyChanges: aiPatchFlow.applyChanges,
          focusChange: aiPatchFlow.focusChange,
        },
        schemaActions: {
          handleApplyAIGeneratedSchema: schemaActions.handleApplyAIGeneratedSchema,
          handleImport: schemaActions.handleImport,
        },
      },
      domains: {
        editor: {
          dbType: editor.dbType,
          indexes: editor.indexes,
          objectType: editor.objectType,
          schemaName: editor.schemaName,
          tableName: editor.tableName,
        },
        ui: {
          isClearDialogOpen: ui.isClearDialogOpen,
          setIsClearDialogOpen: ui.setIsClearDialogOpen,
          isSaveDialogOpen: ui.isSaveDialogOpen,
          isRenameDialogOpen: ui.isRenameDialogOpen,
          isDeleteDialogOpen: ui.isDeleteDialogOpen,
          isDiffDialogOpen: ui.isDiffDialogOpen,
          setIsDiffDialogOpen: ui.setIsDiffDialogOpen,
          versionHistoryTarget: ui.versionHistoryTarget,
          setVersionHistoryTarget: ui.setVersionHistoryTarget,
          timelinePlayerTarget: ui.timelinePlayerTarget,
          setTimelinePlayerTarget: ui.setTimelinePlayerTarget,
          isReviewHistoryOpen: ui.isReviewHistoryOpen,
          setIsReviewHistoryOpen: ui.setIsReviewHistoryOpen,
          isAIGenerateDialogOpen: ui.isAIGenerateDialogOpen,
          setIsAIGenerateDialogOpen: ui.setIsAIGenerateDialogOpen,
          isStorageEstimatorOpen: ui.isStorageEstimatorOpen,
          setIsStorageEstimatorOpen: ui.setIsStorageEstimatorOpen,
          isMockDataDialogOpen: ui.isMockDataDialogOpen,
          setIsMockDataDialogOpen: ui.setIsMockDataDialogOpen,
        },
      },
      visibility: {
        isImportDialogOpen,
        setIsImportDialogOpen,
        isErDialogOpen,
        setIsErDialogOpen,
        isAISchemaPatchOpen,
        setIsAISchemaPatchOpen,
      },
      resources: {
        savedTableData: {
          importTables: savedTableData.importTables,
          saveTable: savedTableData.saveTable,
          savedTables: savedTableData.savedTables,
        },
        folderData: {
          folderTree: folderData.folderTree,
        },
        fieldTemplateData: {
          create: fieldTemplateData.create,
          duplicate: fieldTemplateData.duplicate,
          loading: fieldTemplateData.loading,
          remove: fieldTemplateData.remove,
          templates: fieldTemplateData.templates,
          update: fieldTemplateData.update,
        },
        tableTemplateData: {
          duplicate: tableTemplateData.duplicate,
          loading: tableTemplateData.loading,
          remove: tableTemplateData.remove,
          rename: tableTemplateData.rename,
          templates: tableTemplateData.templates,
        },
      },
      workspace: {
        loadedTableNormalizedName,
        workspaceScope,
        isShareView,
      },
      schema: {
        aiGenerateExistingConfig,
        aiGenerateTemplates,
        canSaveCurrent,
        currentPersistedState,
        hasLoadedTable,
        normalizedFields,
        storageFormat: tableOptions.tableMiscConfig.storedAs || undefined,
        tableDiff,
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
        saveError,
        saveInputDisabled,
        saveName,
      },
    },
  };
}

type AppController = ReturnType<typeof useAppController>;

export type AppWorkspaceModel = AppController['workspaceView'];
export type AppDialogLayerModel = AppController['dialogLayer'];
