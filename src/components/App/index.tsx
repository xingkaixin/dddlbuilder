import { lazy, Suspense, useCallback } from 'react';
import type { DatabaseType, PersistedState } from '@/types';
import { createEmptyRow } from '@/utils/helpers';
import { isTabAvailable } from '@/utils/tabUtils';
import { Header } from './Header';
import { GlobalDialogs } from './containers/GlobalDialogs';
import { OutputContainer } from './containers/OutputContainer';
import { SavedTablesContainer } from './containers/SavedTablesContainer';
import { TableBuilderContainer } from './containers/TableBuilderContainer';
import { useAppSelectors } from './hooks/useAppSelectors';
import { useDialogStates } from './hooks/useDialogStates';
import { useDerivedTableState } from './hooks/useDerivedTableState';
import { useFolderActions } from './hooks/useFolderActions';
import { useTemplateActions } from './hooks/useTemplateActions';
import { useSchemaApplyActions } from './hooks/useSchemaApplyActions';
import { useSavedTableFlowActions } from './hooks/useSavedTableFlowActions';
import { usePersistedSync } from './hooks/usePersistedSync';
import { useApplySavedState } from './hooks/useApplySavedState';
import { useClearAllActions } from './hooks/useClearAllActions';
import { useReviewActions } from './hooks/useReviewActions';
import { useShareAction } from './hooks/useShareAction';
import { useNavigationActions } from './hooks/useNavigationActions';
import { useTemplateToolbarLeft } from './hooks/useTemplateToolbarLeft';
import { useTrackEvent } from './hooks/useTrackEvent';
import { useFireworksIntro } from './hooks/useFireworksIntro';
import { usePersistedState } from '@/hooks/usePersistedState';
import { useAuthManagement } from '@/hooks/useAuthManagement';
import { useSqlGeneration } from '@/hooks/useSqlGeneration';
import { useToast } from '@/hooks/useToast';
import { useCitusSharding } from '@/hooks/useCitusSharding';
import { useMysqlPartition } from '@/hooks/useMysqlPartition';
import { useTableOptions } from '@/hooks/useTableOptions';
import { useDDLReview } from '@/hooks/useDDLReview';
import { useSuggestionAnimation } from '@/hooks/useSuggestionAnimation';
import { useSavedTables } from '@/hooks/useSavedTables';
import { useFolders } from '@/hooks/useFolders';
import { useFieldTemplates } from '@/hooks/useFieldTemplates';

import { TooltipProvider } from '@/components/ui/tooltip';

const FireworksOverlay = lazy(() => import('@/components/FireworksOverlay'));

const INITIAL_ROWS = Array.from({ length: 12 }, (_, index) =>
  createEmptyRow(index),
);
const DEFAULT_FIELD_TABLE_FREEZE_ENABLED = true;
const DEFAULT_FIELD_TABLE_FREEZE_COLUMNS = 3;

function App() {
  const trackEvent = useTrackEvent();

  // ─── 1. Zustand selectors (aggregated) ─────────────────────────
  const {
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
    fieldTableFreezeEnabled,
    setFieldTableFreezeEnabled,
    fieldTableFreezeColumns,
    setFieldTableFreezeColumns,
    showChangelog,
    setShowChangelog,
    isClearDialogOpen,
    setIsClearDialogOpen,
    showFireworks,
    setShowFireworks,
    savedTablesDrawerOpen,
    setSavedTablesDrawerOpen,
    loadedTableNormalizedName,
    setLoadedTableNormalizedName,
    loadedTableName,
    setLoadedTableName,
    loadedTableSignature,
    setLoadedTableSignature,
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
    rows,
    setRows,
    initializeRows,
    resetTableRows,
    indexInput,
    currentIndexFields,
    indexes,
    setIndexInput,
    setCurrentIndexFields,
    initializeIndexState,
    updateIndexNames,
    resetIndexState,
    setIndexes,
  } = useAppSelectors();

  // ─── 2. Dialog states ──────────────────────────────────────────
  const {
    saveDialog,
    renameDialog,
    deleteDialog,
    loadConfirmDialog,
    saveName,
    saveError,
    renameName,
    renameError,
    deleteTarget,
    pendingLoadTarget,
  } = useDialogStates({
    isSaveDialogOpen,
    setIsSaveDialogOpen,
    isRenameDialogOpen,
    setIsRenameDialogOpen,
    isDeleteDialogOpen,
    setIsDeleteDialogOpen,
    isLoadConfirmOpen,
    setIsLoadConfirmOpen,
  });

  const { handleFireworksComplete } = useFireworksIntro({ setShowFireworks });

  // ─── 3. Domain hooks (must come before derived state) ──────────
  const { persistedState, hydrated, saveState, clearState } =
    usePersistedState();

  const {
    authInput,
    authObjects,
    setAuthInput,
    addAuthObject,
    removeAuthObject,
    resetAuthState,
    setAuthObjects,
  } = useAuthManagement(persistedState || undefined);

  const {
    citusShardingConfig,
    setCitusMode,
    setDistributionColumn,
    setCitusShardingConfig,
    resetCitusSharding,
  } = useCitusSharding(persistedState || undefined);

  const {
    animatingIndexIds,
    removingIndexIds,
    triggerIndexAnimation,
    isFieldTableHighlighted,
    highlightedRowIndex,
    triggerFieldTableHighlight,
  } = useSuggestionAnimation();

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
    setMysqlPartitionConfig,
    resetPartition,
  } = useMysqlPartition(persistedState || undefined);

  const {
    tableMiscConfig,
    setMiscEnabled,
    setEngine,
    setCharset,
    setCollation,
    setTablespace,
    setTableMiscConfig,
    resetTableMiscConfig,
  } = useTableOptions(persistedState || undefined);

  // ─── 4. Derived / computed state ───────────────────────────────
  const {
    normalizedFields,
    availableFields,
    filledRowCount,
    indexStats,
    supportsMysqlPartition,
    currentPersistedState,
    buildPersistedState,
    serializePersistedState,
    hasLoadedTable,
    isLoadedDirty,
    canSaveCurrent,
    loadedStatus,
    saveDialogTitle,
    saveDialogDescription,
    saveInputDisabled,
    tableDiff,
  } = useDerivedTableState({
    tableName,
    tableComment,
    dbType,
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
  });

  // ─── 5. SQL generation & data hooks ────────────────────────────
  const { generatedSql, generatedDcl, copySql, copyDcl } = useSqlGeneration(
    dbType,
    tableName,
    tableComment,
    normalizedFields,
    indexes,
    authObjects,
    dbType === 'postgresql-citus' ? citusShardingConfig : undefined,
    supportsMysqlPartition ? mysqlPartitionConfig : undefined,
    tableMiscConfig,
  );

  const { showToast } = useToast();
  const {
    savedTables,
    loading: savedTablesLoading,
    error: savedTablesError,
    saveTable,
    overwriteTable,
    deleteTable,
    renameTable,
    loadTable,
    moveTableToFolder,
    clearTablesFromFolders,
  } = useSavedTables();

  const {
    folderTree,
    loading: foldersLoading,
    createFolder,
    renameFolder,
    deleteFolder: deleteFolderAction,
  } = useFolders();

  const {
    templates,
    loading: templatesLoading,
    create: createTemplate,
    createFromFields: createTemplateFromFields,
    update: updateTemplate,
    remove: deleteTemplate,
    duplicate: duplicateTemplate,
  } = useFieldTemplates();

  // ─── 6. Action hooks ──────────────────────────────────────────
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
  } = useFolderActions({
    folderTree,
    savedTables,
    createFolder,
    renameFolder,
    deleteFolderAction,
    clearTablesFromFolders,
    moveTableToFolder,
    showToast,
  });

  const {
    isTemplateManagerOpen,
    setIsTemplateManagerOpen,
    isCreateTemplateDialogOpen,
    setIsCreateTemplateDialogOpen,
    selectedFieldsForTemplate,
    handleManageTemplates,
    handleApplyTemplate,
    handleCreateTemplateFromFields,
    handleSaveAsTemplate,
  } = useTemplateActions({
    rows,
    setRows,
    createTemplateFromFields,
    showToast,
    trackEvent,
  });

  const {
    isLoading: isReviewing,
    partialResult: reviewPartialResult,
    result: reviewResult,
    error: reviewError,
    startReview,
    setReviewResult,
  } = useDDLReview();

  const { handleStartReview, handleViewReviewHistory } = useReviewActions({
    dbType,
    tableName,
    generatedSql,
    loadedTableNormalizedName,
    isReviewing,
    reviewResult,
    startReview,
    setIsReviewHistoryOpen,
    trackEvent,
  });

  const handleShare = useShareAction({
    buildPersistedState,
    showToast,
    trackEvent,
  });

  usePersistedSync({
    hydrated,
    persistedState,
    saveState,
    buildPersistedState,
    setTableName,
    setTableComment,
    setDbType,
    setAddCount,
    initializeRows,
    initializeIndexState,
    setFieldTableFreezeEnabled,
    setFieldTableFreezeColumns,
    defaultFieldTableFreezeColumns: DEFAULT_FIELD_TABLE_FREEZE_COLUMNS,
  });

  const { handleClearAll, cancelClearAll, confirmClearAll } =
    useClearAllActions({
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
      setLoadedTableNormalizedName,
      setLoadedTableName,
      setLoadedTableSignature,
      trackEvent,
    });

  const applySavedState = useApplySavedState({
    initialRows: INITIAL_ROWS,
    defaultFieldTableFreezeEnabled: DEFAULT_FIELD_TABLE_FREEZE_ENABLED,
    defaultFieldTableFreezeColumns: DEFAULT_FIELD_TABLE_FREEZE_COLUMNS,
    setRows,
    setIndexes,
    setIndexInput,
    setCurrentIndexFields,
    setAuthObjects,
    setAuthInput,
    setCitusShardingConfig,
    resetCitusSharding,
    setMysqlPartitionConfig,
    resetPartition,
    setTableMiscConfig,
    resetTableMiscConfig,
    setTableName,
    setTableComment,
    setDbType,
    setAddCount,
    setFieldTableFreezeEnabled,
    setFieldTableFreezeColumns,
  });

  const {
    handleOpenSaveDialog,
    handleConfirmSave,
    handleSaveDialogOpenChange,
    handleSelectSavedTable,
    handleCancelLoadConfirm,
    handleLoadConfirmOpenChange,
    handleConfirmLoadIgnore,
    handleConfirmLoadSave,
    handleOpenRenameDialog,
    handleRenameDialogOpenChange,
    handleConfirmRename,
    handleOpenDeleteDialog,
    handleDeleteDialogOpenChange,
    handleConfirmDelete,
  } = useSavedTableFlowActions({
    tableName,
    hasLoadedTable,
    isLoadedDirty,
    canSaveCurrent,
    loadedTableNormalizedName,
    loadedTableName,
    setLoadedTableNormalizedName,
    setLoadedTableName,
    setLoadedTableSignature,
    setSavedTablesDrawerOpen,
    saveDialog,
    loadConfirmDialog,
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
    trackEvent,
  });

  const { handleApplySuggestion, handleImport, handleApplyAIGeneratedSchema } =
    useSchemaApplyActions({
      rows,
      indexes,
      reviewResult,
      setRows,
      setIndexes,
      setReviewResult,
      setIndexInput,
      setAuthObjects,
      setAuthInput,
      setTableName,
      setTableComment,
      setDbType,
      setActiveTab,
      triggerIndexAnimation,
      triggerFieldTableHighlight,
      showToast,
      trackEvent,
    });

  const {
    handleOpenSavedTablesDrawer,
    handleOpenDiffDialog,
    handleTabValueChange,
    handleOpenStorageEstimator,
    handleViewVersionHistory,
    handleOpenAIGenerateDialog,
  } = useNavigationActions({
    setSavedTablesDrawerOpen,
    setIsDiffDialogOpen,
    setActiveTab,
    setIsStorageEstimatorOpen,
    setVersionHistoryTarget,
    setIsVersionHistoryOpen,
    setIsAIGenerateDialogOpen,
    trackEvent,
  });

  const handleDbTypeChange = useCallback(
    (newDbType: DatabaseType) => {
      setDbType(newDbType);
      if (!isTabAvailable(activeTab, newDbType)) {
        setActiveTab('fields');
      }
    },
    [setDbType, activeTab, setActiveTab],
  );

  const dataTableToolbarLeft = useTemplateToolbarLeft({
    templates,
    templatesLoading,
    handleApplyTemplate,
    handleManageTemplates,
    handleSaveAsTemplate,
  });

  // ─── 7. Render ─────────────────────────────────────────────────
  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background text-foreground">
        <Header
          showChangelog={showChangelog}
          setShowChangelog={setShowChangelog}
          onShare={handleShare}
          currentDbType={dbType}
          onImport={handleImport}
        />

        {showFireworks && (
          <Suspense
            fallback={<div className="fixed inset-0 z-[100] bg-black/70" />}
          >
            <FireworksOverlay onComplete={handleFireworksComplete} />
          </Suspense>
        )}

        <SavedTablesContainer
          drawerProps={{
            open: savedTablesDrawerOpen,
            onOpenChange: setSavedTablesDrawerOpen,
            loading: savedTablesLoading,
            error: savedTablesError,
            items: savedTables,
            folders: folderTree,
            foldersLoading: foldersLoading,
            activeNormalizedName: loadedTableNormalizedName,
            activeDirty: isLoadedDirty,
            onSelect: handleSelectSavedTable,
            onRename: handleOpenRenameDialog,
            onDelete: handleOpenDeleteDialog,
            onViewHistory: handleViewVersionHistory,
            onMoveToFolder: handleMoveTableToFolder,
            onCreateFolder: handleOpenCreateFolderDialog,
            onRenameFolder: handleOpenRenameFolderDialog,
            onDeleteFolder: handleOpenDeleteFolderDialog,
          }}
        />

        <div className="flex flex-col gap-3 p-3 sm:gap-4 sm:p-4">
          <div className="flex flex-col gap-4 xl:flex-row">
            <TableBuilderContainer
              tableConfigProps={{
                tableName,
                tableComment,
                dbType,
                onTableNameChange: setTableName,
                onTableCommentChange: setTableComment,
                onDbTypeChange: handleDbTypeChange,
                onClearAll: handleClearAll,
                onSaveTable: handleOpenSaveDialog,
                onOpenSavedTables: handleOpenSavedTablesDrawer,
                onViewDiff: handleOpenDiffDialog,
                onOpenAIGenerate: handleOpenAIGenerateDialog,
                saveDisabled: !canSaveCurrent,
                saveDisabledHint: '加载的表未修改，无法保存',
                showDiffButton: isLoadedDirty && tableDiff?.hasChanges,
                loadedStatus,
                loadedTableName,
              }}
              tabsValue={activeTab}
              onTabsValueChange={handleTabValueChange}
              filledRowCount={filledRowCount}
              indexesLength={indexes.length}
              indexStats={indexStats}
              authObjectsLength={authObjects.length}
              miscEnabled={tableMiscConfig.enabled}
              showShardingTab={dbType === 'postgresql-citus'}
              shardingBadgeText={
                citusShardingConfig.mode === 'distributed'
                  ? citusShardingConfig.distributionColumn
                  : null
              }
              showPartitionTab={supportsMysqlPartition}
              partitionBadgeText={
                mysqlPartitionConfig.enabled ? mysqlPartitionConfig.type : null
              }
              dataTableProps={{
                isHighlighted: isFieldTableHighlighted,
                highlightedRowIndex: highlightedRowIndex,
                onOpenStorageEstimator: handleOpenStorageEstimator,
                toolbarLeft: dataTableToolbarLeft,
              }}
              indexPanelProps={{
                animatingIndexIds: animatingIndexIds,
                removingIndexIds: removingIndexIds,
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
            />

            <OutputContainer
              ddlOutputProps={{
                generatedSql,
                generatedDcl,
                dbType,
                onCopySql: copySql,
                onCopyDcl: copyDcl,
                isReviewing,
                reviewPartialResult,
                reviewResult,
                reviewError,
                onStartReview: handleStartReview,
                onViewReviewHistory: handleViewReviewHistory,
                onApplySuggestion: handleApplySuggestion,
              }}
            />
          </div>
        </div>

        <GlobalDialogs
          clearDialog={{
            open: isClearDialogOpen,
            onOpenChange: setIsClearDialogOpen,
            onCancel: cancelClearAll,
            onConfirm: confirmClearAll,
          }}
          saveDialog={{
            open: isSaveDialogOpen,
            onOpenChange: handleSaveDialogOpenChange,
            title: saveDialogTitle,
            description: saveDialogDescription,
            name: saveName,
            onNameChange: (value) => {
              saveDialog.updateData((prev) => ({
                ...prev,
                name: value,
              }));
              if (saveError) saveDialog.clearError();
            },
            error: saveError,
            inputDisabled: saveInputDisabled,
            canSaveCurrent,
            onConfirm: handleConfirmSave,
          }}
          loadConfirmDialog={{
            open: isLoadConfirmOpen,
            onOpenChange: handleLoadConfirmOpenChange,
            pendingName: pendingLoadTarget?.name,
            canSaveCurrent,
            onCancel: handleCancelLoadConfirm,
            onConfirmSave: handleConfirmLoadSave,
            onConfirmIgnore: handleConfirmLoadIgnore,
          }}
          renameDialog={{
            open: isRenameDialogOpen,
            onOpenChange: handleRenameDialogOpenChange,
            name: renameName,
            onNameChange: (value) => {
              renameDialog.updateData((prev) => ({
                ...prev,
                name: value,
              }));
              if (renameError) renameDialog.clearError();
            },
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
          diffDialogProps={{
            open: isDiffDialogOpen,
            onOpenChange: setIsDiffDialogOpen,
            tableName,
            dbType,
            diff: tableDiff,
            fields: normalizedFields,
            onCopy: () => showToast('变更脚本已复制'),
          }}
          versionHistoryDialogProps={{
            open: isVersionHistoryOpen,
            onOpenChange: setIsVersionHistoryOpen,
            tableNormalizedName: versionHistoryTarget?.normalizedName ?? null,
            tableName: versionHistoryTarget?.name ?? null,
            currentState: currentPersistedState,
            onRollback: (state: PersistedState) => {
              applySavedState(state);
              trackEvent('table_version_rollback');
              showToast('已回滚到选中版本');
            },
          }}
          reviewHistoryDialogProps={{
            open: isReviewHistoryOpen,
            onOpenChange: setIsReviewHistoryOpen,
            tableNormalizedName: loadedTableNormalizedName,
          }}
          aiGenerateDialogProps={{
            open: isAIGenerateDialogOpen,
            onOpenChange: setIsAIGenerateDialogOpen,
            dbType,
            existingConfig: {
              tableName,
              rows,
              indexes,
            },
            templates,
            onApply: handleApplyAIGeneratedSchema,
          }}
          storageEstimatorDialogProps={{
            open: isStorageEstimatorOpen,
            onOpenChange: setIsStorageEstimatorOpen,
            dbType,
            fields: normalizedFields,
          }}
        />
      </div>
    </TooltipProvider>
  );
}

export default App;
