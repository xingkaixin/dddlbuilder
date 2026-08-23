import { lazy, Suspense, useState } from 'react';
import { ChevronRight, Upload } from '@/components/icons';
import { Header } from './Header';
import { GlobalDialogs } from './containers/GlobalDialogs';
import { DialogRenderGuard } from './containers/DialogRenderGuard';
import { OutputContainer } from './containers/OutputContainer';
import { SavedTablesDrawer } from './SavedTablesDrawer';
import { TableBuilderContainer } from './containers/TableBuilderContainer';
import { AISchemaPatchPanel } from './AISchemaPatchPanel';
import { AIIndexAdvisorDialog } from './AIIndexAdvisorDialog';
import { MainWorkspaceSkeleton } from './MainWorkspaceSkeleton';
import { WorkspaceSidebar } from './WorkspaceSidebar';
import { TabBar } from './TabBar';
import { WorkspaceEmptyState } from './WorkspaceEmptyState';
import { TableTemplatePopover } from './TableTemplatePopover';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { TooltipProvider } from '@/components/ui/tooltip';
import { isCnyFireworksEnabled } from '@/config/featureFlags';
import { useTranslation } from 'react-i18next';
import { useAppController } from './useAppController';

const FireworksOverlay = lazy(() => import('@/components/FireworksOverlay'));
const ImportSqlDialog = lazy(() =>
  import('@/components/ImportSqlDialog').then((module) => ({
    default: module.ImportSqlDialog,
  })),
);

export function AppView() {
  const { t } = useTranslation();
  const controller = useAppController();
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isErDialogOpen, setIsErDialogOpen] = useState(false);
  const [workspaceSidebarOpen, setWorkspaceSidebarOpen] = useState(true);
  const [outputPanelOpen, setOutputPanelOpen] = useState(true);
  const [isAISchemaPatchOpen, setIsAISchemaPatchOpen] = useState(false);
  const {
    aiCommentActions,
    indexAdvisor,
    folderActions,
    templateActions,
    reviewState,
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
    editor,
    auth,
    sharding,
    animations,
    partition,
    tableOptions,
    savedTableData,
    folderData,
    fieldTemplateData,
    tableTemplateData,
    activeSource,
    activeTabId,
    aiGenerateExistingConfig,
    aiGenerateTemplates,
    availableFields,
    canSaveCurrent,
    copyDcl,
    copyOrm,
    copySql,
    currentPersistedState,
    dataTableToolbarLeft,
    deleteTarget,
    draftSummaries,
    filledRowCount,
    generatedDcl,
    generatedOrm,
    generatedSql,
    handleCloseTab,
    handleCopyDiff,
    handleDbTypeChange,
    handleFireworksComplete,
    handlePlayFireworks,
    handleRenameNameChange,
    handleRollbackVersion,
    handleSaveCurrent,
    handleSaveNameChange,
    handleSelectTableFromEr,
    handleTableNameChange,
    handleViewCurrentVersionHistory,
    isLoadedDirty,
    isShareView,
    loadedTableName,
    loadedTableNormalizedName,
    moveDraftToFolder,
    normalizedFields,
    ormTarget,
    presentedTabs,
    qualifiedTableName,
    recentDrafts,
    recentTables,
    renameError,
    renameName,
    saveDialog,
    saveDialogDescription,
    saveDialogTitle,
    saveError,
    saveInputDisabled,
    saveName,
    schemaLintIssues,
    setOrmTarget,
    shouldShowWorkspaceSkeleton,
    switchToTabById,
    tableDiff,
    tablePresentations,
    tabs,
    trashedDrafts,
    workspaceLabel,
    workspaceScope,
  } = controller;
  const { isGeneratingComments, handleGenerateComments } = aiCommentActions;
  const {
    open: isAIIndexAdvisorOpen,
    setDialogOpen: handleAIIndexAdvisorOpenChange,
    openDialog: handleOpenAIIndexAdvisor,
    isLoading: isAnalyzingIndexes,
    result: indexAdvice,
    error: indexAdviceError,
    suggestedQuery: suggestedIndexQuery,
    blockingMessage: indexAdvisorBlockingMessage,
    analyze: handleAnalyzeIndexes,
    applyRecommendation: handleApplyIndexAdvice,
  } = indexAdvisor;
  const {
    isFolderDialogOpen,
    setIsFolderDialogOpen,
    folderDialogMode,
    folderDialogParent,
    folderDialogTarget,
    isDeleteFolderDialogOpen,
    setIsDeleteFolderDialogOpen,
    deleteFolderTarget,
    deleteFolderTableCount,
    handleOpenCreateFolderDialog,
    handleOpenRenameFolderDialog,
    handleOpenDeleteFolderDialog,
    handleFolderDialogConfirm,
    handleDeleteFolderConfirm,
    handleMoveTableToFolder,
    handleMoveFolderToFolder,
  } = folderActions;
  const {
    isTemplateManagerOpen,
    setIsTemplateManagerOpen,
    isCreateTemplateDialogOpen,
    setIsCreateTemplateDialogOpen,
    selectedFieldsForTemplate,
    handleCreateTemplateFromFields,
  } = templateActions;
  const {
    isLoading: isReviewing,
    partialResult: reviewPartialResult,
    result: reviewResult,
    error: reviewError,
  } = reviewState;
  const { handleStartReview, handleViewReviewHistory } = reviewActions;
  const { handleShare, isSharing } = shareAction;
  const { handleClearAll, cancelClearAll, confirmClearAll } = clearActions;
  const {
    handleOpenSaveDialog,
    handleConfirmSave,
    handleSaveDialogOpenChange,
    handleOpenRenameDialog,
    handleRenameDialogOpenChange,
    handleConfirmRename,
    handleOpenDeleteDialog,
    handleDeleteDialogOpenChange,
    handleConfirmDelete,
  } = savedTableFlow;
  const {
    handleSelectSavedTable,
    handleSelectDraft,
    handleDeleteDraft,
    handleCreateDraft,
    handleLoadExample,
  } = workspaceTabs;
  const {
    isManagerOpen: isTableTemplateManagerOpen,
    setIsManagerOpen: setIsTableTemplateManagerOpen,
    isCreateDialogOpen: isCreateTableTemplateDialogOpen,
    setIsCreateDialogOpen: setIsCreateTableTemplateDialogOpen,
    pendingBlueprint: pendingTableTemplateBlueprint,
    handleManageTemplates: handleManageTableTemplates,
    handleSaveAsTemplate: handleSaveAsTableTemplate,
    handleCreateTemplate: handleCreateTableTemplate,
    handleApplyTemplate: handleApplyTableTemplate,
  } = tableTemplateActions;
  const {
    isEmptyTrashDialogOpen,
    setIsEmptyTrashDialogOpen,
    handleRestoreTable,
    handleRestoreDraft,
    handleDeleteDraftPermanently,
    handleDeleteTablePermanently,
    handleEmptyTrash,
    handleConfirmEmptyTrash,
  } = trashActions;
  const { applyChanges: handleApplyAISchemaChanges, focusChange: handleFocusAISchemaChange } =
    aiPatchFlow;
  const { handleApplySuggestion, handleImport, handleApplyAIGeneratedSchema } = schemaActions;
  const {
    handleOpenSavedTablesDrawer,
    handleOpenDiffDialog,
    handleTabValueChange,
    handleOpenStorageEstimator,
    handleViewVersionHistory,
    handleOpenAIGenerateDialog,
    handleOpenMockDataGenerator,
  } = navigationActions;
  const handleOpenErDiagram = () => setIsErDialogOpen(true);
  const handleOpenAISchemaPatchPanel = () => {
    if (tabs.length === 0 && !isShareView) {
      handleOpenAIGenerateDialog();
      return;
    }
    setIsAISchemaPatchOpen(true);
  };
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
    setTableComment,
    setObjectType,
    setViewDefinition,
    setViewCreateOrReplace,
    setSqlFormatMode,
    activeTab,
    setActiveTab,
    showFireworks,
    savedTablesDrawerOpen,
    setSavedTablesDrawerOpen,
    isSaveDialogOpen,
    isRenameDialogOpen,
    isDeleteDialogOpen,
    indexes,
  } = editor;
  const { authInput, authObjects, setAuthInput, addAuthObject, removeAuthObject } = auth;
  const { citusShardingConfig, setCitusMode, setDistributionColumn } = sharding;
  const { animatingIndexIds, removingIndexIds, isFieldTableHighlighted, highlightedRowIndex } =
    animations;
  const {
    mysqlPartitionConfig,
    setPartitionEnabled,
    setPartitionType,
    setPartitionColumns,
    setPartitionExpression,
    setPartitionCount,
    addPartition,
    removePartition,
    updatePartition,
    generateRangePartitions,
  } = partition;
  const {
    tableMiscConfig,
    setMiscEnabled,
    setEngine,
    setCharset,
    setCollation,
    setTablespace,
    setFillfactor,
    setPctfree,
    setInitrans,
    setStoredAs,
    setExternal,
    setLocation,
    setHivePartitionEnabled,
    addHivePartitionColumn,
    removeHivePartitionColumn,
    updateHivePartitionColumn,
    setHiveClustering,
  } = tableOptions;
  const {
    savedTables,
    trashedTables,
    loading: savedTablesLoading,
    error: savedTablesError,
    saveTable,
    importTables,
  } = savedTableData;
  const { folderTree, loading: foldersLoading } = folderData;
  const {
    templates,
    loading: templatesLoading,
    create: createTemplate,
    update: updateTemplate,
    remove: deleteTemplate,
    duplicate: duplicateTemplate,
  } = fieldTemplateData;
  const {
    templates: tableTemplates,
    loading: tableTemplatesLoading,
    rename: renameTableTemplate,
    remove: deleteTableTemplate,
    duplicate: duplicateTableTemplate,
  } = tableTemplateData;

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background text-foreground">
        <Header
          onShare={handleShare}
          isSharing={isSharing}
          currentDbType={dbType}
          onImport={handleImport}
          onPlayFireworks={isCnyFireworksEnabled ? handlePlayFireworks : undefined}
          savedTables={savedTables}
          folderTree={folderTree}
          onBatchImportComplete={() => {
            setSavedTablesDrawerOpen(true);
          }}
          onBatchImport={importTables}
          onOpenAIGenerate={handleOpenAIGenerateDialog}
        />

        {isShareView && (
          <div className="mx-3 mt-3 flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-300 sm:flex-row sm:items-center sm:justify-between">
            <p>{t('app.shareBanner')}</p>
            <button
              type="button"
              onClick={handleOpenSaveDialog}
              className="inline-flex shrink-0 items-center justify-center rounded-md border border-amber-500/40 bg-amber-100 px-3 py-2 text-xs font-medium text-amber-900 transition-colors hover:bg-amber-200 dark:border-amber-600 dark:bg-amber-900/50 dark:text-amber-100 dark:hover:bg-amber-900"
            >
              {t('app.saveAsCopy')}
            </button>
          </div>
        )}

        {isCnyFireworksEnabled && showFireworks && (
          <Suspense fallback={<div className="fixed inset-0 z-[100] bg-black/70" />}>
            <FireworksOverlay onComplete={handleFireworksComplete} />
          </Suspense>
        )}

        <SavedTablesDrawer
          open={savedTablesDrawerOpen}
          onOpenChange={setSavedTablesDrawerOpen}
          loading={savedTablesLoading}
          error={savedTablesError}
          items={savedTables}
          draftItems={draftSummaries}
          activeDraftId={
            !isShareView && activeSource.kind === 'draft' ? activeSource.draftId : null
          }
          folders={folderTree}
          foldersLoading={foldersLoading}
          activeNormalizedName={loadedTableNormalizedName}
          activeDirty={isLoadedDirty}
          tablePresentations={tablePresentations}
          onSelectDraft={handleSelectDraft}
          onDeleteDraft={handleDeleteDraft}
          onSelect={handleSelectSavedTable}
          onRename={handleOpenRenameDialog}
          onDelete={handleOpenDeleteDialog}
          onViewHistory={handleViewVersionHistory}
          onMoveToFolder={handleMoveTableToFolder}
          onMoveFolder={handleMoveFolderToFolder}
          onCreateFolder={handleOpenCreateFolderDialog}
          onRenameFolder={handleOpenRenameFolderDialog}
          onDeleteFolder={handleOpenDeleteFolderDialog}
        />

        <div className="flex flex-col sm:flex-row">
          {!isShareView && workspaceSidebarOpen && (
            <WorkspaceSidebar
              loading={savedTablesLoading || foldersLoading}
              error={savedTablesError}
              items={savedTables}
              trashedItems={trashedTables}
              trashedDraftItems={trashedDrafts}
              draftItems={draftSummaries}
              folders={folderTree}
              activeNormalizedName={loadedTableNormalizedName}
              activeDraftId={activeSource.kind === 'draft' ? activeSource.draftId : null}
              activeDirty={isLoadedDirty}
              tablePresentations={tablePresentations}
              onCollapse={() => setWorkspaceSidebarOpen(false)}
              onOpenWorkspace={handleOpenSavedTablesDrawer}
              onCreateFolder={() => handleOpenCreateFolderDialog()}
              onSelectDraft={handleSelectDraft}
              onDeleteDraft={handleDeleteDraft}
              onMoveDraftToFolder={moveDraftToFolder}
              onSelect={handleSelectSavedTable}
              onRename={handleOpenRenameDialog}
              onDelete={handleOpenDeleteDialog}
              onRestore={handleRestoreTable}
              onDeletePermanently={handleDeleteTablePermanently}
              onRestoreDraft={handleRestoreDraft}
              onDeleteDraftPermanently={handleDeleteDraftPermanently}
              onEmptyTrash={handleEmptyTrash}
              onMoveToFolder={handleMoveTableToFolder}
              onMoveFolder={handleMoveFolderToFolder}
              onRenameFolder={handleOpenRenameFolderDialog}
              onDeleteFolder={handleOpenDeleteFolderDialog}
              onViewHistory={handleViewVersionHistory}
            />
          )}

          <div className="min-w-0 flex-1" data-testid="workspace-content">
            {!isShareView && (
              <TabBar
                leadingAction={
                  !workspaceSidebarOpen ? (
                    <button
                      type="button"
                      className="mb-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      onClick={() => setWorkspaceSidebarOpen(true)}
                      aria-label={t('savedTables.expand')}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  ) : undefined
                }
                tabs={presentedTabs}
                activeTabId={activeTabId}
                onActivateTab={switchToTabById}
                onCloseTab={handleCloseTab}
                onCreateTab={handleCreateDraft}
              />
            )}
            <div className="p-3 sm:p-4">
              {shouldShowWorkspaceSkeleton ? (
                <MainWorkspaceSkeleton />
              ) : tabs.length === 0 && !isShareView ? (
                <WorkspaceEmptyState
                  hasContent={draftSummaries.length > 0 || savedTables.length > 0}
                  recentDrafts={recentDrafts}
                  recentTables={recentTables}
                  onCreateNewTable={handleCreateDraft}
                  onOpenDraft={handleSelectDraft}
                  onOpenTable={handleSelectSavedTable}
                  onLoadExample={handleLoadExample}
                  importButton={
                    <button
                      type="button"
                      onClick={() => setIsImportDialogOpen(true)}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border bg-card px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <Upload className="h-4 w-4" />
                      {t('emptyState.importDDL')}
                    </button>
                  }
                  templateButton={
                    <TableTemplatePopover
                      templates={tableTemplates}
                      loading={tableTemplatesLoading}
                      onApplyTemplate={handleApplyTableTemplate}
                      onManageTemplates={handleManageTableTemplates}
                      onSaveAsTemplate={handleSaveAsTableTemplate}
                      triggerClassName="inline-flex h-9 items-center justify-center gap-2 rounded-lg border bg-card px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    />
                  }
                />
              ) : (
                <div className="flex flex-col gap-4 xl:flex-row">
                  <div
                    className={`min-w-0 flex-1 ${
                      isShareView ? 'pointer-events-none select-none opacity-80' : ''
                    }`}
                  >
                    <TableBuilderContainer
                      tableConfigProps={{
                        schemaName,
                        tableName,
                        tableComment,
                        objectType,
                        dbType,
                        onSchemaNameChange: setSchemaName,
                        onTableNameChange: handleTableNameChange,
                        onTableCommentChange: setTableComment,
                        onObjectTypeChange: (value) => {
                          setObjectType(value);
                          setActiveTab('fields');
                        },
                        onDbTypeChange: handleDbTypeChange,
                        onClearAll: handleClearAll,
                        onSaveCurrent: handleSaveCurrent,
                        onViewDiff: handleOpenDiffDialog,
                        onViewHistory: handleViewCurrentVersionHistory,
                        onOpenErDiagram: handleOpenErDiagram,
                        onExpandOutputPanel:
                          !isShareView && !outputPanelOpen
                            ? () => setOutputPanelOpen(true)
                            : undefined,
                        saveDisabled: !canSaveCurrent,
                        saveDisabledHint: t('dialogs.save.disabledTip'),
                        showDiffButton: isLoadedDirty && tableDiff?.hasChanges,
                        showHistoryButton: Boolean(loadedTableNormalizedName),
                        loadedTableName,
                        workspaceLabel,
                        fieldCount: filledRowCount,
                        indexCount: indexes.length,
                      }}
                      tabsValue={activeTab}
                      onTabsValueChange={handleTabValueChange}
                      dataTableProps={{
                        isHighlighted: isFieldTableHighlighted,
                        highlightedRowIndex: highlightedRowIndex,
                        onOpenStorageEstimator: handleOpenStorageEstimator,
                        onOpenMockDataGenerator: handleOpenMockDataGenerator,
                        onOpenAISchemaPatch: handleOpenAISchemaPatchPanel,
                        onGenerateComments: handleGenerateComments,
                        isGeneratingComments,
                        onOpenAIIndexAdvisor:
                          dbType === 'hive' ? undefined : handleOpenAIIndexAdvisor,
                        toolbarLeft: dataTableToolbarLeft,
                      }}
                      viewDefinitionPanelProps={{
                        definition: viewDefinition,
                        createOrReplace: viewCreateOrReplace,
                        onDefinitionChange: setViewDefinition,
                        onCreateOrReplaceChange: setViewCreateOrReplace,
                      }}
                      indexPanelProps={{
                        animatingIndexIds: animatingIndexIds,
                        removingIndexIds: removingIndexIds,
                      }}
                      foreignKeyPanelProps={{
                        availableFields,
                      }}
                      authPanelProps={{
                        authInput,
                        authObjects,
                        onAuthInputChange: setAuthInput,
                        onAddAuthObject: addAuthObject,
                        onRemoveAuthObject: removeAuthObject,
                      }}
                      tableOptionsPanelProps={{
                        dbType,
                        config: tableMiscConfig,
                        onEnabledChange: setMiscEnabled,
                        onEngineChange: setEngine,
                        onCharsetChange: setCharset,
                        onCollationChange: setCollation,
                        onTablespaceChange: setTablespace,
                        onFillfactorChange: setFillfactor,
                        onPctfreeChange: setPctfree,
                        onInitransChange: setInitrans,
                        onStoredAsChange: setStoredAs,
                        onExternalChange: setExternal,
                        onLocationChange: setLocation,
                      }}
                      shardingPanelProps={{
                        config: citusShardingConfig,
                        availableFields,
                        onModeChange: setCitusMode,
                        onDistributionColumnChange: setDistributionColumn,
                      }}
                      partitionPanelProps={{
                        config: mysqlPartitionConfig,
                        availableFields,
                        onEnabledChange: setPartitionEnabled,
                        onTypeChange: setPartitionType,
                        onColumnsChange: setPartitionColumns,
                        onExpressionChange: setPartitionExpression,
                        onPartitionCountChange: setPartitionCount,
                        onAddPartition: addPartition,
                        onRemovePartition: removePartition,
                        onUpdatePartition: updatePartition,
                        onGeneratePartitions: generateRangePartitions,
                      }}
                      hivePartitionPanelProps={{
                        config: tableMiscConfig.partitions || {
                          enabled: false,
                          columns: [],
                        },
                        onEnabledChange: setHivePartitionEnabled,
                        onAddColumn: addHivePartitionColumn,
                        onRemoveColumn: removeHivePartitionColumn,
                        onUpdateColumn: updateHivePartitionColumn,
                        onClusteringChange: setHiveClustering,
                      }}
                    />
                  </div>

                  {(isShareView || outputPanelOpen) && (
                    <OutputContainer
                      onCollapse={isShareView ? undefined : () => setOutputPanelOpen(false)}
                      ddlOutputProps={{
                        generatedSql,
                        generatedDcl,
                        dbType,
                        routineTableNameDefault: qualifiedTableName,
                        sqlFormatMode,
                        onSqlFormatModeChange: setSqlFormatMode,
                        onCopySql: copySql,
                        onCopyDcl: copyDcl,
                        generatedOrm,
                        ormTarget,
                        onOrmTargetChange: setOrmTarget,
                        onCopyOrm: copyOrm,
                        isReviewing,
                        reviewPartialResult,
                        reviewResult,
                        reviewError,
                        schemaLintIssues,
                        onStartReview: handleStartReview,
                        onViewReviewHistory: handleViewReviewHistory,
                        onApplySuggestion: handleApplySuggestion,
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <GlobalDialogs
          clearDialog={{
            onCancel: cancelClearAll,
            onConfirm: confirmClearAll,
          }}
          saveDialog={{
            open: isSaveDialogOpen,
            onOpenChange: handleSaveDialogOpenChange,
            title: saveDialog.data.queuedLoadAfterSave
              ? t('dialogs.save.queuedLoadTitle')
              : saveDialogTitle,
            description: saveDialog.data.queuedLoadAfterSave
              ? t('dialogs.save.queuedLoadDescription')
              : saveDialogDescription,
            name: saveName,
            onNameChange: handleSaveNameChange,
            error: saveError,
            inputDisabled: saveInputDisabled,
            canSaveCurrent,
            onConfirm: handleConfirmSave,
          }}
          renameDialog={{
            open: isRenameDialogOpen,
            onOpenChange: handleRenameDialogOpenChange,
            name: renameName,
            onNameChange: handleRenameNameChange,
            error: renameError,
            onConfirm: handleConfirmRename,
          }}
          deleteDialog={{
            open: isDeleteDialogOpen,
            onOpenChange: handleDeleteDialogOpenChange,
            targetName: deleteTarget?.name,
            onConfirm: handleConfirmDelete,
          }}
          folderDialogProps={{
            open: isFolderDialogOpen,
            onOpenChange: setIsFolderDialogOpen,
            mode: folderDialogMode,
            parentFolder: folderDialogParent,
            targetFolder: folderDialogTarget,
            onConfirm: handleFolderDialogConfirm,
          }}
          deleteFolderDialogProps={{
            open: isDeleteFolderDialogOpen,
            onOpenChange: setIsDeleteFolderDialogOpen,
            folder: deleteFolderTarget,
            tableCount: deleteFolderTableCount,
            onConfirm: handleDeleteFolderConfirm,
          }}
          templateManagerDialogProps={{
            open: isTemplateManagerOpen,
            onOpenChange: setIsTemplateManagerOpen,
            templates,
            loading: templatesLoading,
            onCreateTemplate: createTemplate,
            onUpdateTemplate: updateTemplate,
            onDuplicateTemplate: duplicateTemplate,
            onDeleteTemplate: deleteTemplate,
          }}
          createTemplateDialogProps={{
            open: isCreateTemplateDialogOpen,
            onOpenChange: setIsCreateTemplateDialogOpen,
            selectedFields: selectedFieldsForTemplate,
            onConfirm: handleCreateTemplateFromFields,
          }}
          tableTemplateManagerDialogProps={{
            open: isTableTemplateManagerOpen,
            onOpenChange: setIsTableTemplateManagerOpen,
            templates: tableTemplates,
            loading: tableTemplatesLoading,
            onRenameTemplate: renameTableTemplate,
            onDuplicateTemplate: duplicateTableTemplate,
            onDeleteTemplate: deleteTableTemplate,
          }}
          createTableTemplateDialogProps={{
            open: isCreateTableTemplateDialogOpen,
            onOpenChange: setIsCreateTableTemplateDialogOpen,
            blueprint: pendingTableTemplateBlueprint,
            onConfirm: handleCreateTableTemplate,
          }}
          diffDialogProps={{
            tableName,
            dbType,
            diff: tableDiff,
            fields: normalizedFields,
            onCopy: handleCopyDiff,
          }}
          versionHistoryDialogProps={{
            currentState: currentPersistedState,
            onRollback: handleRollbackVersion,
          }}
          reviewHistoryDialogProps={{
            tableNormalizedName: loadedTableNormalizedName,
          }}
          aiGenerateDialogProps={{
            dbType,
            existingConfig: aiGenerateExistingConfig,
            templates: aiGenerateTemplates,
            onApply: handleApplyAIGeneratedSchema,
          }}
          storageEstimatorDialogProps={{
            dbType,
            fields: normalizedFields,
            indexes,
            storageFormat: tableMiscConfig.storedAs || undefined,
          }}
          mockDataDialogProps={{
            tableName,
            schemaName,
            dbType,
            fields: normalizedFields,
          }}
          erDiagramDialogProps={{
            open: isErDialogOpen,
            onOpenChange: setIsErDialogOpen,
            onSelectTable: handleSelectTableFromEr,
            saveTable,
            workspaceScope,
          }}
          emptyTrashDialog={{
            open: isEmptyTrashDialogOpen,
            onOpenChange: setIsEmptyTrashDialogOpen,
            onConfirm: handleConfirmEmptyTrash,
          }}
        />

        <DialogRenderGuard open={isAISchemaPatchOpen}>
          <Dialog open={isAISchemaPatchOpen} onOpenChange={setIsAISchemaPatchOpen}>
            <DialogContent className="flex max-h-[88vh] w-[min(1080px,calc(100vw-2rem))] max-w-none flex-col overflow-hidden p-0">
              <DialogTitle className="sr-only">{t('aiPatch.title')}</DialogTitle>
              <AISchemaPatchPanel
                dbType={dbType}
                currentState={currentPersistedState}
                templates={[...templates, ...tableTemplates]}
                onApplyChanges={handleApplyAISchemaChanges}
                onFocusChange={handleFocusAISchemaChange}
              />
            </DialogContent>
          </Dialog>
        </DialogRenderGuard>

        <DialogRenderGuard open={isAIIndexAdvisorOpen}>
          <AIIndexAdvisorDialog
            open={isAIIndexAdvisorOpen}
            onOpenChange={handleAIIndexAdvisorOpenChange}
            isLoading={isAnalyzingIndexes}
            result={indexAdvice}
            error={indexAdviceError}
            suggestedQuery={suggestedIndexQuery}
            blockingMessage={indexAdvisorBlockingMessage}
            onAnalyze={handleAnalyzeIndexes}
            onApplyIndex={handleApplyIndexAdvice}
          />
        </DialogRenderGuard>

        {!isShareView && (
          <Suspense fallback={null}>
            <DialogRenderGuard open={isImportDialogOpen}>
              <ImportSqlDialog
                currentDbType={dbType}
                onImport={handleImport}
                open={isImportDialogOpen}
                onOpenChange={setIsImportDialogOpen}
                hideTrigger
                savedTables={savedTables}
                folderTree={folderTree}
                onBatchImport={importTables}
              />
            </DialogRenderGuard>
          </Suspense>
        )}
      </div>
    </TooltipProvider>
  );
}
