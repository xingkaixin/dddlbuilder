import { isSameSavedTable } from '@ddlbuilder/shared-types/workspace';
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
import { useAuthSession } from '@/auth/AuthSessionProvider';
import { useWebMcpTools } from '@/webmcp/useWebMcpTools';
import { buildAppDialogLayerModel } from './buildAppDialogLayerModel';
import { buildAppWorkspaceModel } from './buildAppWorkspaceModel';

import { isCnyFireworksEnabled } from '@/config/featureFlags';

export function useAppController() {
  const { t } = useTranslation();
  const authSession = useAuthSession();
  const domains = useEditorDomains();
  const { editor, ui, auth, sharding, animations, partition, tableOptions } = domains;
  const workspaceController = useWorkspaceController();
  const {
    persistence,
    savedTableData,
    folderData,
    workspaceScope,
    loadedTableSource,
    loadedTableNormalizedName,
    loadedTableName,
    loadedTableSignature,
  } = workspaceController;
  const {
    schemaName,
    tableName,
    tableComment,
    setTableName,
    setDbType,
    activeTab,
    setActiveTab,
    resetDocument,
    rows,
    setRows,
    indexes,
  } = editor;
  const {
    outputPanelOpen,
    setIsClearDialogOpen,
    setShowFireworks,
    setSavedTablesDrawerOpen,
    setIsImportDialogOpen,
    setIsErDialogOpen,
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

  const dialogStates = useDialogStates({
    isSaveDialogOpen,
    setIsSaveDialogOpen,
    isRenameDialogOpen,
    setIsRenameDialogOpen,
    isDeleteDialogOpen,
    setIsDeleteDialogOpen,
  });
  const { saveDialog, renameDialog, deleteDialog } = dialogStates;

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
    getSavedTableDraft,
    removeSavedTableDraft,
    renameSavedTableDraft,
    persistSavedTableDraft,
    trashedDrafts,
    restoreDraftById,
    permanentlyDeleteDraftById,
  } = persistence;
  const { triggerIndexAnimation, triggerFieldTableHighlight } = animations;

  const loadedTableId =
    savedTableData.savedTables.find(
      (table) => loadedTableSource && isSameSavedTable(table, loadedTableSource),
    )?.tableId ?? null;

  const schemaController = useSchemaController({
    domains: { editor, ui, auth, sharding, animations, partition, tableOptions },
    hydrated,
    isShareView,
    workspaceScope,
    loadedTableId,
    loadedTableNormalizedName,
    loadedTableName,
    loadedTableSignature,
    countTableVersions: savedTableData.countTableVersions,
  });
  const {
    currentPersistedState,
    buildPersistedState,
    serializePersistedState,
    hasLoadedTable,
    isLoadedDirty,
    canSaveCurrent,
  } = schemaController.derived;
  const { setLoadedTableVersion, workspaceLabel } = schemaController.loadedPresentation;
  const { reviewState, showToast } = schemaController;
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
  const { tabs, activeTabId, activeWorkspaceTab, getActiveTab, updateActiveTabTitle } =
    tabLifecycle;
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
    countTableVersions,
    createTableVersion,
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
    resetDocument,
  });

  const savedTableTabIntegration = useSavedTableTabIntegration({
    isShareView,
    workspaceScope,
    activeSource: activeEditorSource,
    deleteDraftById,
    removeSavedTableDraft,
    buildPersistedState,
    persistSavedTableDraft,
    selectWorkspaceSnapshot,
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
    countTableVersions,
    createTableVersion,
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
    const currentTable = savedTables.find(
      (table) => loadedTableSource && isSameSavedTable(table, loadedTableSource),
    );
    if (!currentTable) return;
    handleViewVersionHistory({
      tableId: currentTable.tableId,
      normalizedName: loadedTableNormalizedName,
      name: loadedTableName,
    });
  }, [
    handleViewVersionHistory,
    loadedTableName,
    loadedTableNormalizedName,
    loadedTableSource,
    savedTables,
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

  const workspacePresentation = useWorkspacePresentation({
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

  const webMcpDialog = useWebMcpTools({
    authStatus: authSession.status,
    openAuthDialog: authSession.openAuthDialog,
    hydrated,
    isShareView,
    source: activeEditorSource,
    state: currentPersistedState,
    generatedSql: schemaController.sql.generatedSql,
    generatedDcl: schemaController.sql.generatedDcl,
    generatedOrm: schemaController.orm.generatedOrm,
    replaceState: applySavedState,
  });

  const workspaceView = buildAppWorkspaceModel({
    domains,
    workspaceController,
    tableTemplateData,
    schemaController,
    tabLifecycle,
    folderActions,
    savedTableFlow,
    workspaceTabs,
    tableTemplateActions,
    trashActions,
    schemaActions,
    navigationActions,
    workspacePresentation,
    editorSurface,
    activeEditorSource,
    isLoadedDirty,
    collapseSidebar,
    expandSidebar,
    openImportDialog,
    openWorkspaceAfterImport,
    handleFireworksComplete,
    handlePlayFireworks,
  });
  const dialogLayer = buildAppDialogLayerModel({
    domains,
    workspaceController,
    schemaController,
    webMcpDialog,
    folderActions,
    templateActions,
    clearActions,
    savedTableFlow,
    tableTemplateActions,
    trashActions,
    aiPatchFlow,
    schemaActions,
    fieldTemplateData,
    tableTemplateData,
    dialogStates,
    aiGenerateExistingConfig,
    aiGenerateTemplates,
    handleCopyDiff,
    handleRollbackVersion,
    handleSelectTableFromEr,
  });

  return { workspaceView, dialogLayer };
}
