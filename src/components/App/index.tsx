import { useCallback, useEffect, useMemo, lazy, Suspense } from 'react';
import type { PersistedState } from '@/types';
import { createEmptyRow } from '@/utils/helpers';
import { Header } from './Header';
import { GlobalDialogs } from './containers/GlobalDialogs';
import { OutputContainer } from './containers/OutputContainer';
import { SavedTablesContainer } from './containers/SavedTablesContainer';
import { TableBuilderContainer } from './containers/TableBuilderContainer';
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
import { useSavedTables, type SavedTableSummary } from '@/hooks/useSavedTables';
import { useFolders } from '@/hooks/useFolders';
import {
  buildNormalizedFields,
  useAppStore,
  useFieldStore,
  useIndexStore,
} from '@/stores';
import { useDialogState } from '@/hooks/useDialogState';
import { useFieldTemplates } from '@/hooks/useFieldTemplates';
import { sanitizeIndexesForPersist } from '@/utils/indexUtils';
import { diffPersistedState, type TableDiff } from '@/utils/tableDiff';

const FireworksOverlay = lazy(() => import('@/components/FireworksOverlay'));

const INITIAL_ROWS = Array.from({ length: 12 }, (_, index) =>
  createEmptyRow(index),
);
const DEFAULT_FIELD_TABLE_FREEZE_ENABLED = true;
const DEFAULT_FIELD_TABLE_FREEZE_COLUMNS = 3;

function App() {
  const trackEvent = useTrackEvent();

  // Basic state (batch 4: migrated to zustand)
  const tableName = useAppStore((state) => state.tableName);
  const tableComment = useAppStore((state) => state.tableComment);
  const dbType = useAppStore((state) => state.dbType);
  const setTableName = useAppStore((state) => state.setTableName);
  const setTableComment = useAppStore((state) => state.setTableComment);
  const setDbType = useAppStore((state) => state.setDbType);
  const addCount = useAppStore((state) => state.addCount);
  const setAddCount = useAppStore((state) => state.setAddCount);
  const fieldTableFreezeEnabled = useAppStore(
    (state) => state.fieldTableFreezeEnabled,
  );
  const setFieldTableFreezeEnabled = useAppStore(
    (state) => state.setFieldTableFreezeEnabled,
  );
  const fieldTableFreezeColumns = useAppStore(
    (state) => state.fieldTableFreezeColumns,
  );
  const setFieldTableFreezeColumns = useAppStore(
    (state) => state.setFieldTableFreezeColumns,
  );
  const activeTab = useAppStore((state) => state.activeTab);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const resetTableConfig = useAppStore((state) => state.resetTableConfig);
  const resetTableViewConfig = useAppStore(
    (state) => state.resetTableViewConfig,
  );

  // Changelog / global UI states (batch 4: migrated to zustand)
  const showChangelog = useAppStore((state) => state.showChangelog);
  const setShowChangelog = useAppStore((state) => state.setShowChangelog);
  const isClearDialogOpen = useAppStore((state) => state.isClearDialogOpen);
  const setIsClearDialogOpen = useAppStore(
    (state) => state.setIsClearDialogOpen,
  );
  const showFireworks = useAppStore((state) => state.showFireworks);
  const setShowFireworks = useAppStore((state) => state.setShowFireworks);

  // Saved tables drawer & dialogs (batch 4: migrated to zustand)
  const savedTablesDrawerOpen = useAppStore(
    (state) => state.savedTablesDrawerOpen,
  );
  const setSavedTablesDrawerOpen = useAppStore(
    (state) => state.setSavedTablesDrawerOpen,
  );
  const loadedTableNormalizedName = useAppStore(
    (state) => state.loadedTableNormalizedName,
  );
  const setLoadedTableNormalizedName = useAppStore(
    (state) => state.setLoadedTableNormalizedName,
  );
  const loadedTableName = useAppStore((state) => state.loadedTableName);
  const setLoadedTableName = useAppStore((state) => state.setLoadedTableName);
  const loadedTableSignature = useAppStore(
    (state) => state.loadedTableSignature,
  );
  const setLoadedTableSignature = useAppStore(
    (state) => state.setLoadedTableSignature,
  );
  const isSaveDialogOpen = useAppStore((state) => state.dialogs.save);
  const setIsSaveDialogOpen = useAppStore((state) => state.setIsSaveDialogOpen);
  const isRenameDialogOpen = useAppStore((state) => state.dialogs.rename);
  const setIsRenameDialogOpen = useAppStore(
    (state) => state.setIsRenameDialogOpen,
  );
  const isDeleteDialogOpen = useAppStore((state) => state.dialogs.delete);
  const setIsDeleteDialogOpen = useAppStore(
    (state) => state.setIsDeleteDialogOpen,
  );
  const isLoadConfirmOpen = useAppStore((state) => state.dialogs.loadConfirm);
  const setIsLoadConfirmOpen = useAppStore(
    (state) => state.setIsLoadConfirmOpen,
  );

  const saveDialog = useDialogState<{
    name: string;
    queuedLoadAfterSave: SavedTableSummary | null;
  }>({
    open: isSaveDialogOpen,
    setOpen: setIsSaveDialogOpen,
    initialData: {
      name: '',
      queuedLoadAfterSave: null,
    },
  });

  const renameDialog = useDialogState<{
    name: string;
    target: SavedTableSummary | null;
  }>({
    open: isRenameDialogOpen,
    setOpen: setIsRenameDialogOpen,
    initialData: {
      name: '',
      target: null,
    },
  });

  const deleteDialog = useDialogState<{
    target: SavedTableSummary | null;
  }>({
    open: isDeleteDialogOpen,
    setOpen: setIsDeleteDialogOpen,
    initialData: {
      target: null,
    },
  });

  const loadConfirmDialog = useDialogState<{
    pendingTarget: SavedTableSummary | null;
  }>({
    open: isLoadConfirmOpen,
    setOpen: setIsLoadConfirmOpen,
    initialData: {
      pendingTarget: null,
    },
  });
  const saveName = saveDialog.data.name;
  const saveError = saveDialog.error;
  const renameName = renameDialog.data.name;
  const renameError = renameDialog.error;
  const deleteTarget = deleteDialog.data.target;
  const pendingLoadTarget = loadConfirmDialog.data.pendingTarget;

  const isDiffDialogOpen = useAppStore((state) => state.isDiffDialogOpen);
  const setIsDiffDialogOpen = useAppStore((state) => state.setIsDiffDialogOpen);
  const isVersionHistoryOpen = useAppStore(
    (state) => state.isVersionHistoryOpen,
  );
  const setIsVersionHistoryOpen = useAppStore(
    (state) => state.setIsVersionHistoryOpen,
  );
  const versionHistoryTarget = useAppStore(
    (state) => state.versionHistoryTarget,
  );
  const setVersionHistoryTarget = useAppStore(
    (state) => state.setVersionHistoryTarget,
  );
  const isReviewHistoryOpen = useAppStore((state) => state.isReviewHistoryOpen);
  const setIsReviewHistoryOpen = useAppStore(
    (state) => state.setIsReviewHistoryOpen,
  );
  const isStorageEstimatorOpen = useAppStore(
    (state) => state.isStorageEstimatorOpen,
  );
  const setIsStorageEstimatorOpen = useAppStore(
    (state) => state.setIsStorageEstimatorOpen,
  );
  const isAIGenerateDialogOpen = useAppStore(
    (state) => state.isAIGenerateDialogOpen,
  );
  const setIsAIGenerateDialogOpen = useAppStore(
    (state) => state.setIsAIGenerateDialogOpen,
  );

  const { handleFireworksComplete } = useFireworksIntro({ setShowFireworks });

  // Use custom hooks
  const { persistedState, hydrated, saveState, clearState } =
    usePersistedState();

  const rows = useFieldStore((state) => state.rows);
  const setRows = useFieldStore((state) => state.setRows);
  const initializeRows = useFieldStore((state) => state.initializeRows);
  const resetTableRows = useFieldStore((state) => state.resetRows);
  const normalizedFields = useMemo(() => buildNormalizedFields(rows), [rows]);

  const availableFields = useMemo(
    () =>
      normalizedFields
        .map((field) => field.name)
        .filter((name) => name.length > 0),
    [normalizedFields],
  );

  const filledRowCount = useMemo(
    () => rows.filter((row) => row.fieldName?.trim()).length,
    [rows],
  );

  const indexInput = useIndexStore((state) => state.indexInput);
  const currentIndexFields = useIndexStore((state) => state.currentIndexFields);
  const indexes = useIndexStore((state) => state.indexes);
  const setIndexInput = useIndexStore((state) => state.setIndexInput);
  const setCurrentIndexFields = useIndexStore(
    (state) => state.setCurrentIndexFields,
  );
  const initializeIndexState = useIndexStore(
    (state) => state.initializeIndexState,
  );
  const updateIndexNames = useIndexStore((state) => state.updateIndexNames);
  const resetIndexState = useIndexStore((state) => state.resetIndexState);
  const setIndexes = useIndexStore((state) => state.setIndexes);

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

  // Suggestion animation hook
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

  // Check if MySQL-compatible database that supports partitioning
  const supportsMysqlPartition = ['mysql', 'mariadb', 'tidb'].includes(dbType);
  const baseTabCount = 4;
  const extraTabCount =
    (dbType === 'postgresql-citus' ? 1 : 0) + (supportsMysqlPartition ? 1 : 0);
  const totalTabCount = baseTabCount + extraTabCount;
  const tabGridClass =
    totalTabCount === 6
      ? 'grid-cols-6'
      : totalTabCount === 5
        ? 'grid-cols-5'
        : 'grid-cols-4';

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

  const sanitizedIndexesForPersist = useMemo(
    () => sanitizeIndexesForPersist(indexes),
    [indexes],
  );

  const currentPersistedState = useMemo(
    (): PersistedState => ({
      tableName,
      tableComment,
      dbType,
      rows: normalizedRowsForPersist,
      addCount,
      indexInput,
      currentIndexFields,
      indexes: sanitizedIndexesForPersist,
      authInput,
      authObjects,
      citusShardingConfig:
        dbType === 'postgresql-citus' ? citusShardingConfig : undefined,
      mysqlPartitionConfig: supportsMysqlPartition
        ? mysqlPartitionConfig
        : undefined,
      tableMiscConfig,
      fieldTableViewConfig: {
        freezeEnabled: fieldTableFreezeEnabled,
        freezeColumns: fieldTableFreezeColumns,
      },
    }),
    [
      tableName,
      tableComment,
      dbType,
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

  const serializePersistedState = useCallback(
    (state: PersistedState) => JSON.stringify(state),
    [],
  );

  const currentStateSignature = useMemo(
    () =>
      loadedTableSignature == null
        ? null
        : serializePersistedState(currentPersistedState),
    [loadedTableSignature, currentPersistedState, serializePersistedState],
  );

  const hasLoadedTable = Boolean(loadedTableNormalizedName);
  const isLoadedDirty =
    hasLoadedTable &&
    loadedTableSignature != null &&
    currentStateSignature != null &&
    currentStateSignature !== loadedTableSignature;
  const canSaveCurrent = !hasLoadedTable || isLoadedDirty;
  const loadedStatus = hasLoadedTable
    ? isLoadedDirty
      ? 'dirty'
      : 'clean'
    : null;
  const saveDialogTitle = hasLoadedTable ? '更新保存的表' : '保存当前表';
  const saveDialogDescription = hasLoadedTable
    ? '当前为已加载表，保存将覆盖原记录。'
    : '保存后可在左侧列表中快速加载。';
  const saveInputDisabled = hasLoadedTable;

  // Compute diff between loaded state and current state
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

  const { toastMessage, showToast } = useToast();
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

  // Folders hook
  const {
    folderTree,
    loading: foldersLoading,
    createFolder,
    renameFolder,
    deleteFolder: deleteFolderAction,
  } = useFolders();

  // Field templates hook
  const {
    templates,
    loading: templatesLoading,
    create: createTemplate,
    createFromFields: createTemplateFromFields,
    update: updateTemplate,
    remove: deleteTemplate,
    duplicate: duplicateTemplate,
  } = useFieldTemplates();

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

  // DDL Review hook
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

  const dataTableToolbarLeft = useTemplateToolbarLeft({
    templates,
    templatesLoading,
    handleApplyTemplate,
    handleManageTemplates,
    handleSaveAsTemplate,
  });

  return (
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
              onDbTypeChange: setDbType,
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
            tabGridClass={tabGridClass}
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
          onRollback: (state) => {
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
        toastMessage={toastMessage}
      />
    </div>
  );
}

export default App;
