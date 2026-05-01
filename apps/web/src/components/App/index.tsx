import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import type { AICommentMode, DatabaseType, PersistedState } from '@ddlbuilder/shared-types';
import { createEmptyRow, ensureOrder } from '@/utils/helpers';
import { isTabAvailable } from '@/utils/tabUtils';
import { Upload } from 'lucide-react';
import { Header } from './Header';
import { GlobalDialogs } from './containers/GlobalDialogs';
import { OutputContainer } from './containers/OutputContainer';
import { SavedTablesContainer } from './containers/SavedTablesContainer';
import { TableBuilderContainer } from './containers/TableBuilderContainer';
import { AISchemaPatchPanel } from './AISchemaPatchPanel';
import { MainWorkspaceSkeleton } from './MainWorkspaceSkeleton';
import { WorkspaceSidebar } from './WorkspaceSidebar';
import { TabBar } from './TabBar';
import { WorkspaceEmptyState } from './WorkspaceEmptyState';
import { TableTemplatePopover } from './TableTemplatePopover';
import { useTabStore } from '@/stores';
import { useAppSelectors } from './hooks/useAppSelectors';
import { useDialogStates } from './hooks/useDialogStates';
import { useDerivedTableState } from './hooks/useDerivedTableState';
import { useFolderActions } from './hooks/useFolderActions';
import { useTemplateActions } from './hooks/useTemplateActions';
import { useTableTemplateActions } from './hooks/useTableTemplateActions';
import { useSchemaApplyActions } from './hooks/useSchemaApplyActions';
import { useSavedTableFlowActions } from './hooks/useSavedTableFlowActions';
import { usePersistedSync } from './hooks/usePersistedSync';
import { useApplySavedState } from './hooks/useApplySavedState';
import { useClearAllActions } from './hooks/useClearAllActions';
import { useReviewActions } from './hooks/useReviewActions';
import { useShareAction } from './hooks/useShareAction';
import { useNavigationActions } from './hooks/useNavigationActions';
import { useTemplateToolbarLeft } from './hooks/useTemplateToolbarLeft';
import { useFireworksIntro } from './hooks/useFireworksIntro';
import { usePersistedState } from '@/hooks/usePersistedState';
import { useAuthManagement } from '@/hooks/useAuthManagement';
import { useSqlGeneration } from '@/hooks/useSqlGeneration';
import { useOrmGeneration } from '@/hooks/useOrmGeneration';
import { useToast } from '@/hooks/useToast';
import { useCitusSharding } from '@/hooks/useCitusSharding';
import { useMysqlPartition } from '@/hooks/useMysqlPartition';
import { useTableOptions } from '@/hooks/useTableOptions';
import { useDDLReview } from '@/hooks/useDDLReview';
import { useAIComments } from '@/hooks/useAIComments';
import { useSuggestionAnimation } from '@/hooks/useSuggestionAnimation';
import { useSavedTables } from '@/hooks/useSavedTables';
import type { SavedTableSummary } from '@/hooks/useSavedTables';
import { useFolders } from '@/hooks/useFolders';
import { useFieldTemplates } from '@/hooks/useFieldTemplates';
import { useTableTemplates } from '@/hooks/useTableTemplates';
import { countVersions } from '@/utils/tableVersions';
import { writeWorkspaceSession } from '@/utils/workspaceStateDb';
import { lintSchema } from '@/utils/schemaLint';
import { buildQualifiedTableName } from '@ddlbuilder/ddl-core';
import { EXAMPLE_USER_PROFILE_TABLE } from '@/utils/exampleTable';
import { useTranslation } from 'react-i18next';
import type { AISchemaChange } from '@/utils/aiSchemaChanges';

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { TooltipProvider } from '@/components/ui/tooltip';
import { isCnyFireworksEnabled } from '@/config/featureFlags';

const FireworksOverlay = lazy(() => import('@/components/FireworksOverlay'));
const ImportSqlDialog = lazy(() =>
  import('@/components/ImportSqlDialog').then((module) => ({
    default: module.ImportSqlDialog,
  })),
);

const INITIAL_ROWS = Array.from({ length: 12 }, (_, index) => createEmptyRow(index));
const DEFAULT_FIELD_TABLE_FREEZE_ENABLED = false;
const DEFAULT_FIELD_TABLE_FREEZE_COLUMNS = 3;
const SHARE_COPY_SAVED_TOAST_KEY = 'ddlbuilder:share:copy-saved:v1';

const createEmptyGlobalDraftState = (): PersistedState => ({
  schemaName: '',
  tableName: '',
  tableComment: '',
  dbType: 'mysql',
  sqlFormatMode: 'compact',
  rows: Array.from({ length: 12 }, (_, index) => createEmptyRow(index)),
  addCount: 10,
  indexInput: '',
  currentIndexFields: [],
  indexes: [],
  authInput: '',
  authObjects: [],
});

function App() {
  const trackEvent = useCallback(async (..._args: unknown[]) => {}, []);
  const { t } = useTranslation();

  // ─── 1. Zustand selectors (aggregated) ─────────────────────────
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
    fieldTableFreezeEnabled,
    setFieldTableFreezeEnabled,
    fieldTableFreezeColumns,
    setFieldTableFreezeColumns,
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
    isMockDataDialogOpen,
    setIsMockDataDialogOpen,
    isTimelinePlayerOpen,
    setIsTimelinePlayerOpen,
    timelinePlayerTarget,
    setTimelinePlayerTarget,
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
    foreignKeys,
    setForeignKeys,
    initializeForeignKeyState,
    resetForeignKeyState,
  } = useAppSelectors();

  // ─── 2. Dialog states ──────────────────────────────────────────
  const {
    saveDialog,
    renameDialog,
    deleteDialog,
    saveName,
    saveError,
    renameName,
    renameError,
    deleteTarget,
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

  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);

  // ─── 3. Domain hooks (must come before derived state) ──────────
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
    createDraft,
    deleteDraftById,
    moveDraftToFolder,
    getSavedTableDraft,
    removeSavedTableDraft,
    renameSavedTableDraft,
    trashedDrafts,
    restoreDraftById,
    permanentlyDeleteDraftById,
  } = usePersistedState();

  // ─── Tab store ─────────────────────────────────────────────────
  const {
    tabs,
    activeTabId,
    addTab,
    activateTab,
    closeTab: closeTabStore,
    updateActiveTabSnapshot,
    updateActiveTabTitle,
    updateActiveTabSource,
    findTabBySource,
    getActiveTab,
    setTabLoading,
    removeTabBySource,
    updateTabTitleBySource,
  } = useTabStore();

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
    setFillfactor,
    setPctfree,
    setInitrans,
    setStoredAs,
    setExternal,
    setLocation,
    setHivePartitionConfig,
    setTableMiscConfig,
    resetTableMiscConfig,
  } = useTableOptions(persistedState || undefined);

  const qualifiedTableName = useMemo(
    () => buildQualifiedTableName(schemaName, tableName),
    [schemaName, tableName],
  );

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

  // ─── 5. SQL generation & data hooks ────────────────────────────
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

  const routineTableNameDefault = useMemo(
    () => buildQualifiedTableName(schemaName, tableName),
    [schemaName, tableName],
  );

  const { showToast } = useToast();
  const { isLoading: isGeneratingComments, generateComments } = useAIComments();

  const handleGenerateComments = useCallback(
    (mode: AICommentMode, targetLocale?: 'zh-CN' | 'en-US') => {
      void (async () => {
        try {
          const result = await generateComments({
            mode,
            targetLocale,
            schemaName,
            tableName: tableName.trim() || 'current_table',
            tableComment,
            fields: rows
              .filter((row) => row.fieldName.trim())
              .map((row) => ({
                fieldName: row.fieldName.trim(),
                fieldType: row.fieldType.trim(),
                fieldComment: row.fieldComment.trim(),
              })),
          });

          if (!result) return;

          const commentsByField = new Map(
            result.fields.map((field) => [field.fieldName, field.fieldComment]),
          );

          if (result.tableComment && (mode === 'translate' || !tableComment.trim())) {
            setTableComment(result.tableComment);
          }

          setRows((prev) =>
            prev.map((row) => {
              const nextComment = commentsByField.get(row.fieldName.trim());
              if (!nextComment || (mode === 'fill_missing' && row.fieldComment.trim())) {
                return row;
              }
              return { ...row, fieldComment: nextComment };
            }),
          );

          showToast(t('aiComments.done'));
          void trackEvent('ai_comments_apply', { mode, targetLocale });
        } catch (error) {
          showToast((error as Error).message || t('services.generationFailed'));
        }
      })();
    },
    [
      generateComments,
      schemaName,
      tableName,
      tableComment,
      rows,
      setTableComment,
      setRows,
      showToast,
      t,
      trackEvent,
    ],
  );

  useEffect(() => {
    if (shareLoadStatus === 'not_found') {
      showToast(t('app.shareNotFound'));
      return;
    }
    if (shareLoadStatus === 'error') {
      showToast(t('app.shareLoadFailed'));
    }
  }, [shareLoadStatus, showToast, t]);

  useEffect(() => {
    if (!hydrated || !isShareView) return;
    showToast(t('app.shareReadOnly'));
  }, [hydrated, isShareView, showToast, t]);

  useEffect(() => {
    if (isShareView) return;
    try {
      const savedCopyName = sessionStorage.getItem(SHARE_COPY_SAVED_TOAST_KEY);
      if (!savedCopyName) return;
      sessionStorage.removeItem(SHARE_COPY_SAVED_TOAST_KEY);
      showToast(
        t('app.shareCopySaved', {
          name: savedCopyName,
        }),
      );
    } catch {
      // ignore sessionStorage errors
    }
  }, [isShareView, showToast, t]);

  const {
    savedTables,
    trashedTables,
    loading: savedTablesLoading,
    error: savedTablesError,
    saveTable,
    overwriteTable,
    deleteTable,
    restoreTable,
    deleteTablePermanently,
    renameTable,
    loadTable,
    moveTableToFolder,
    clearTablesFromFolders,
    refresh: refreshSavedTables,
  } = useSavedTables();

  const {
    folderTree,
    loading: foldersLoading,
    createFolder,
    renameFolder,
    moveFolder,
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

  const {
    templates: tableTemplates,
    loading: tableTemplatesLoading,
    create: createTableTemplate,
    rename: renameTableTemplate,
    remove: deleteTableTemplate,
    duplicate: duplicateTableTemplate,
  } = useTableTemplates();

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
    handleMoveFolderToFolder,
  } = useFolderActions({
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

  const clearLoadedTable = useCallback(() => {
    setLoadedTableNormalizedName(null);
    setLoadedTableName(null);
    setLoadedTableSignature(null);
  }, [setLoadedTableName, setLoadedTableNormalizedName, setLoadedTableSignature]);

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
    tableName: qualifiedTableName,
    generatedSql,
    loadedTableNormalizedName,
    isReviewing,
    reviewResult,
    startReview,
    setIsReviewHistoryOpen,
    trackEvent,
  });

  const schemaLintIssues = useMemo(
    () => lintSchema({ tableName, rows, indexes }),
    [tableName, rows, indexes],
  );

  const { handleShare, isSharing } = useShareAction({
    buildPersistedState,
    showToast,
    trackEvent,
  });

  usePersistedSync({
    hydrated,
    hasOpenTab: tabs.length > 0,
    persistedState,
    activeSource,
    saveState,
    buildPersistedState,
    setSchemaName,
    setTableName,
    setTableComment,
    setObjectType,
    setViewDefinition,
    setViewCreateOrReplace,
    setDbType,
    setSqlFormatMode,
    setAddCount,
    initializeRows,
    initializeIndexState,
    initializeForeignKeyState,
    setFieldTableFreezeEnabled,
    setFieldTableFreezeColumns,
    defaultFieldTableFreezeColumns: DEFAULT_FIELD_TABLE_FREEZE_COLUMNS,
    setLoadedTableNormalizedName,
    setLoadedTableName,
    setLoadedTableSignature,
    loadedTableNormalizedName,
    updateActiveTabSnapshot,
  });

  const { handleClearAll, cancelClearAll, confirmClearAll } = useClearAllActions({
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
    setForeignKeys,
    resetForeignKeys: resetForeignKeyState,
    setAuthObjects,
    setAuthInput,
    setCitusShardingConfig,
    resetCitusSharding,
    setMysqlPartitionConfig,
    resetPartition,
    setTableMiscConfig,
    resetTableMiscConfig,
    setSchemaName,
    setTableName,
    setTableComment,
    setObjectType,
    setViewDefinition,
    setViewCreateOrReplace,
    setDbType,
    setSqlFormatMode,
    setAddCount,
    setFieldTableFreezeEnabled,
    setFieldTableFreezeColumns,
  });

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
  } = useTableTemplateActions({
    currentState: currentPersistedState,
    applyState: applySavedState,
    createTemplate: createTableTemplate,
    clearLoadedTable,
    showToast,
    trackEvent,
  });

  const flushCurrentWorkspace = useCallback(() => {
    if (!hydrated || isShareView) return;
    const state = buildPersistedState();
    const source = activeSource;

    console.log('[DEBUG] flushCurrentWorkspace - 保存当前工作区:', {
      sourceKind: source.kind,
      sourceDetails: source,
      currentUITableName: state.tableName,
    });

    const isDirty =
      source.kind === 'saved_table'
        ? serializePersistedState(state) !== source.baseSignature
        : false;

    // 保存到当前激活标签页的快照
    updateActiveTabSnapshot(state, isDirty);

    // 保持原有的 IndexedDB 保存
    saveState({ state, source, isDirty });
  }, [
    hydrated,
    isShareView,
    activeSource,
    buildPersistedState,
    serializePersistedState,
    updateActiveTabSnapshot,
    saveState,
  ]);

  const [loadedTableVersion, setLoadedTableVersion] = useState<number>(0);
  const [isSavedTableLoading, setIsSavedTableLoading] = useState(false);
  const [isErDialogOpen, setIsErDialogOpen] = useState(false);
  const [workspaceSidebarOpen, setWorkspaceSidebarOpen] = useState(true);
  const [outputPanelOpen, setOutputPanelOpen] = useState(true);
  const [isAISchemaPatchOpen, setIsAISchemaPatchOpen] = useState(false);
  const [isEmptyTrashDialogOpen, setIsEmptyTrashDialogOpen] = useState(false);

  useEffect(() => {
    if (!hydrated || isShareView) return;
    if (!loadedTableNormalizedName) {
      setLoadedTableVersion(0);
      return;
    }

    let cancelled = false;
    void countVersions(loadedTableNormalizedName)
      .then((count) => {
        if (cancelled) return;
        setLoadedTableVersion(count > 0 ? count : 1);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadedTableVersion(1);
      });

    return () => {
      cancelled = true;
    };
  }, [hydrated, isShareView, loadedTableNormalizedName]);

  const {
    handleOpenSaveDialog,
    handleConfirmSave,
    handleSaveDialogOpenChange,
    handleLoadSavedTable,
    handleOpenRenameDialog,
    handleRenameDialogOpenChange,
    handleConfirmRename,
    handleOpenDeleteDialog,
    handleDeleteDialogOpenChange,
    handleConfirmDelete,
  } = useSavedTableFlowActions({
    tableName,
    hasLoadedTable,
    canSaveCurrent,
    loadedTableNormalizedName,
    loadedTableName,
    loadedTableSignature,
    setLoadedTableNormalizedName,
    setLoadedTableName,
    setLoadedTableSignature,
    setLoadedTableVersion,
    setSavedTablesDrawerOpen,
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
    trackEvent,
    flushCurrentWorkspace,
    getSavedTableDraft,
    setWorkspaceSnapshot,
    renameSavedTableDraft,
    removeSavedTableDraft,
    onTableLoadStateChange: setIsSavedTableLoading,
    onSaveSuccess: async ({ normalizedName, displayName, baseSignature, mode }) => {
      if (isShareView) {
        try {
          await writeWorkspaceSession({
            activeSource: {
              kind: 'saved_table',
              normalizedName,
              tableName: displayName,
              baseSignature,
            },
            activeState: null,
            updatedAt: Date.now(),
          });
          sessionStorage.setItem(SHARE_COPY_SAVED_TOAST_KEY, displayName);
        } catch {
          // ignore persistence errors
        }
        window.location.replace('/');
        return;
      }
      if (mode === 'create' && activeSource.kind === 'draft') {
        deleteDraftById(activeSource.draftId);
      }
      removeSavedTableDraft(normalizedName);

      // 更新标签页 title 和 source
      updateActiveTabTitle(displayName);
      updateActiveTabSource({
        kind: 'saved_table',
        normalizedName,
        tableName: displayName,
        baseSignature,
      });
      updateActiveTabSnapshot(buildPersistedState(), false);
    },
    onTabRename: (fromNormalizedName, toNormalizedName, newTitle) => {
      updateTabTitleBySource(
        {
          kind: 'saved_table',
          normalizedName: fromNormalizedName,
          tableName: '',
          baseSignature: '',
        },
        newTitle,
      );
    },
    onTabRemove: (normalizedName) => {
      removeTabBySource({
        kind: 'saved_table',
        normalizedName,
        tableName: '',
        baseSignature: '',
      });
    },
  });

  const handleSaveCurrent = useCallback(() => {
    if (hasLoadedTable) {
      void handleConfirmSave();
      return;
    }
    handleOpenSaveDialog();
  }, [hasLoadedTable, handleConfirmSave, handleOpenSaveDialog]);

  const handleSelectSavedTable = useCallback(
    async (item: SavedTableSummary) => {
      if (tabs.length > 0) {
        flushCurrentWorkspace();
      }
      setSavedTablesDrawerOpen(false);

      const existingTab = findTabBySource({
        kind: 'saved_table',
        normalizedName: item.normalizedName,
        tableName: item.name,
        baseSignature: '',
      });
      if (existingTab) {
        activateTab(existingTab.id);
        applySavedState(existingTab.stateSnapshot);
        setWorkspaceSnapshot(existingTab.source, existingTab.stateSnapshot);
        return;
      }

      const currentState = buildPersistedState();
      const newTabId = addTab({
        title: item.name,
        source: {
          kind: 'saved_table',
          normalizedName: item.normalizedName,
          tableName: item.name,
          baseSignature: '',
        },
        stateSnapshot: currentState,
        isDirty: false,
        isLoading: true,
      });
      activateTab(newTabId);

      const result = await handleLoadSavedTable(item);
      // 加载完成后，检查用户是否仍然在该标签页
      if (useTabStore.getState().activeTabId === newTabId) {
        if (result) {
          updateActiveTabSource({
            kind: 'saved_table',
            normalizedName: item.normalizedName,
            tableName: item.name,
            baseSignature: result.signature,
          });
          updateActiveTabSnapshot(result.state, false);
        }
      } else {
        // 用户已切换到其他标签页，恢复当前激活标签页的状态
        const currentTab = getActiveTab();
        if (currentTab) {
          applySavedState(currentTab.stateSnapshot);
          setWorkspaceSnapshot(currentTab.source, currentTab.stateSnapshot);
        }
      }
      setTabLoading(newTabId, false);
    },
    [
      flushCurrentWorkspace,
      setSavedTablesDrawerOpen,
      findTabBySource,
      activateTab,
      applySavedState,
      setWorkspaceSnapshot,
      buildPersistedState,
      addTab,
      handleLoadSavedTable,
      updateActiveTabSource,
      updateActiveTabSnapshot,
      setTabLoading,
      getActiveTab,
      tabs,
    ],
  );

  const handleSelectDraft = useCallback(
    (draftId: string) => {
      if (tabs.length > 0) {
        flushCurrentWorkspace();
      }
      setSavedTablesDrawerOpen(false);

      const existingTab = findTabBySource({ kind: 'draft', draftId });
      if (existingTab) {
        activateTab(existingTab.id);
        applySavedState(existingTab.stateSnapshot);
        setWorkspaceSnapshot(existingTab.source, existingTab.stateSnapshot);
        setLoadedTableNormalizedName(null);
        setLoadedTableName(null);
        setLoadedTableSignature(null);
        setLoadedTableVersion(0);
        return;
      }

      const existedDraftState = getDraftState(draftId);
      const nextState = existedDraftState ?? createEmptyGlobalDraftState();
      const draftName =
        draftSummaries.find((d) => d.draftId === draftId)?.name ?? t('app.workspace.globalDraft');

      const newTabId = addTab({
        title: draftName,
        source: { kind: 'draft', draftId },
        stateSnapshot: nextState,
        isDirty: false,
      });
      activateTab(newTabId);
      applySavedState(nextState);
      setWorkspaceSnapshot({ kind: 'draft', draftId }, nextState);
      setLoadedTableNormalizedName(null);
      setLoadedTableName(null);
      setLoadedTableSignature(null);
      setLoadedTableVersion(0);

      showToast(existedDraftState ? t('app.loadedDraft') : t('app.emptyDraftCreated'));
    },
    [
      flushCurrentWorkspace,
      setSavedTablesDrawerOpen,
      findTabBySource,
      activateTab,
      applySavedState,
      setWorkspaceSnapshot,
      getDraftState,
      draftSummaries,
      addTab,
      setLoadedTableNormalizedName,
      setLoadedTableName,
      setLoadedTableSignature,
      showToast,
      t,
      tabs,
    ],
  );

  const handleCreateDraft = useCallback(() => {
    if (tabs.length > 0) {
      flushCurrentWorkspace();
    }
    const draftId = `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const emptyState = createEmptyGlobalDraftState();
    const uniqueName = createDraft(draftId, emptyState);
    const finalState =
      uniqueName !== emptyState.tableName ? { ...emptyState, tableName: uniqueName } : emptyState;

    const newTabId = addTab({
      title: uniqueName,
      source: { kind: 'draft', draftId },
      stateSnapshot: finalState,
      isDirty: false,
    });
    activateTab(newTabId);
    applySavedState(finalState);
    setWorkspaceSnapshot({ kind: 'draft', draftId }, finalState);
    setLoadedTableNormalizedName(null);
    setLoadedTableName(null);
    setLoadedTableSignature(null);
    setLoadedTableVersion(0);
  }, [
    flushCurrentWorkspace,
    createDraft,
    addTab,
    activateTab,
    applySavedState,
    setWorkspaceSnapshot,
    setLoadedTableNormalizedName,
    setLoadedTableName,
    setLoadedTableSignature,
    tabs,
  ]);

  const handleLoadExample = useCallback(() => {
    if (tabs.length > 0) {
      flushCurrentWorkspace();
    }
    const draftId = `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const exampleState = EXAMPLE_USER_PROFILE_TABLE;
    const uniqueName = createDraft(draftId, exampleState);
    const finalState =
      uniqueName !== exampleState.tableName
        ? { ...exampleState, tableName: uniqueName }
        : exampleState;

    const newTabId = addTab({
      title: uniqueName,
      source: { kind: 'draft', draftId },
      stateSnapshot: finalState,
      isDirty: false,
    });
    activateTab(newTabId);
    applySavedState(finalState);
    setWorkspaceSnapshot({ kind: 'draft', draftId }, finalState);
    setLoadedTableNormalizedName(null);
    setLoadedTableName(null);
    setLoadedTableSignature(null);
    setLoadedTableVersion(0);
    showToast(t('emptyState.exampleLoaded'));
  }, [
    flushCurrentWorkspace,
    createDraft,
    addTab,
    activateTab,
    applySavedState,
    setWorkspaceSnapshot,
    setLoadedTableNormalizedName,
    setLoadedTableName,
    setLoadedTableSignature,
    showToast,
    t,
    tabs,
  ]);

  const handleCloseTab = useCallback(
    (tabId: string) => {
      closeTabStore(tabId);

      const nextActive = getActiveTab();
      if (nextActive) {
        applySavedState(nextActive.stateSnapshot);
        setWorkspaceSnapshot(nextActive.source, nextActive.stateSnapshot);
      }
      // 没有标签页了，不做额外操作，渲染逻辑会显示空状态
    },
    [closeTabStore, getActiveTab, applySavedState, setWorkspaceSnapshot],
  );

  const handleRestoreTable = useCallback(
    (item: SavedTableSummary) => {
      const existingFolderIds = new Set(folderTree.map((f) => f.id));
      void restoreTable(item.normalizedName, { existingFolderIds }).then((result) => {
        showToast(
          result.ok
            ? t('savedTables.restore')
            : (result.message ?? t('savedTables.toast.moveFailed')),
        );
      });
    },
    [restoreTable, showToast, t, folderTree],
  );

  const handleRestoreDraft = useCallback(
    (draftId: string) => {
      void restoreDraftById(draftId).then(() => {
        showToast(t('savedTables.restore'));
      });
    },
    [restoreDraftById, showToast, t],
  );

  const handleDeleteDraftPermanently = useCallback(
    (draftId: string) => {
      permanentlyDeleteDraftById(draftId);
      showToast(t('savedTables.deletePermanently'));
    },
    [permanentlyDeleteDraftById, showToast, t],
  );

  const handleDeleteTablePermanently = useCallback(
    (item: SavedTableSummary) => {
      void deleteTablePermanently(item.normalizedName).then((result) => {
        showToast(
          result.ok
            ? t('savedTables.deletePermanently')
            : (result.message ?? t('savedTables.toast.deleteFolderFailed')),
        );
      });
    },
    [deleteTablePermanently, showToast, t],
  );

  const handleEmptyTrash = useCallback(() => {
    setIsEmptyTrashDialogOpen(true);
  }, []);

  const handleConfirmEmptyTrash = useCallback(() => {
    setIsEmptyTrashDialogOpen(false);

    // 批量永久删除回收站中的表和草稿
    void Promise.all([
      ...trashedTables.map((item) => deleteTablePermanently(item.normalizedName)),
      ...trashedDrafts.map((draft) =>
        (async () => {
          permanentlyDeleteDraftById(draft.draftId);
          return { ok: true as const };
        })(),
      ),
    ]).then(() => {
      showToast(t('savedTables.deletePermanently'));
    });
  }, [
    trashedTables,
    trashedDrafts,
    deleteTablePermanently,
    permanentlyDeleteDraftById,
    showToast,
    t,
  ]);

  const handleDeleteDraft = useCallback(
    (draftId: string) => {
      deleteDraftById(draftId);

      const tab = findTabBySource({ kind: 'draft', draftId });
      if (tab) {
        if (tab.id === activeTabId) {
          // 关闭激活标签页会自动创建新草稿
          handleCloseTab(tab.id);
        } else {
          // 非激活标签页直接移除
          closeTabStore(tab.id);
        }
      }

      showToast(t('app.draftDeleted'));
    },
    [deleteDraftById, findTabBySource, activeTabId, handleCloseTab, closeTabStore, showToast, t],
  );

  const workspaceLabel = useMemo(() => {
    if (isShareView) return t('app.workspace.shareReadonly');
    if (loadedTableName) {
      return t('app.workspace.currentTable', {
        name: loadedTableName,
        version:
          loadedTableVersion > 0 ? t('app.workspace.version', { version: loadedTableVersion }) : '',
        dirty: isLoadedDirty ? t('app.workspace.dirtyMark') : '',
      });
    }
    return t('app.workspace.globalDraft');
  }, [isShareView, loadedTableName, isLoadedDirty, loadedTableVersion, t]);

  const handleApplyAIGeneratedStateToDraft = useCallback(
    (state: PersistedState) => {
      if (tabs.length > 0) {
        flushCurrentWorkspace();
      }

      const draftId = `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const baseName = state.tableName.trim() || '未命名草稿';
      const uniqueName = createDraft(draftId, state);
      const finalState = uniqueName !== baseName ? { ...state, tableName: uniqueName } : state;

      const newTabId = addTab({
        title: uniqueName,
        source: { kind: 'draft', draftId },
        stateSnapshot: finalState,
        isDirty: false,
      });
      activateTab(newTabId);
      applySavedState(finalState);
      setWorkspaceSnapshot({ kind: 'draft', draftId }, finalState);
      setLoadedTableNormalizedName(null);
      setLoadedTableName(null);
      setLoadedTableSignature(null);
      setLoadedTableVersion(0);
    },
    [
      tabs.length,
      flushCurrentWorkspace,
      createDraft,
      addTab,
      activateTab,
      applySavedState,
      setWorkspaceSnapshot,
      setLoadedTableNormalizedName,
      setLoadedTableName,
      setLoadedTableSignature,
    ],
  );

  const handleApplyAISchemaChange = useCallback(
    (change: AISchemaChange, candidateState: PersistedState) => {
      if (change.kind === 'table') {
        if (change.type === 'schema_name') {
          setSchemaName(change.newValue);
        } else if (change.type === 'table_name') {
          setTableName(change.newValue);
        } else {
          setTableComment(change.newValue);
        }
      }

      if (change.kind === 'field') {
        setActiveTab('fields');
        setRows((prev) => {
          if (change.type === 'add' && change.newRow) {
            const candidateIndex = candidateState.rows.findIndex(
              (row) => row.fieldName === change.newRow?.fieldName,
            );
            const insertIndex =
              candidateIndex >= 0 ? Math.min(candidateIndex, prev.length) : prev.length;
            const next = prev.slice();
            next.splice(insertIndex, 0, change.newRow);
            return ensureOrder(next);
          }

          if ((change.type === 'modify' || change.type === 'rename') && change.newRow) {
            const nextRow = change.newRow;
            const targetName = change.oldFieldName || change.oldRow?.fieldName || change.fieldName;
            return ensureOrder(
              prev.map((row) =>
                row.fieldName.trim().toLowerCase() === targetName.trim().toLowerCase()
                  ? nextRow
                  : row,
              ),
            );
          }

          if (change.type === 'remove') {
            const targetName = change.oldRow?.fieldName || change.fieldName;
            return ensureOrder(
              prev.filter(
                (row) => row.fieldName.trim().toLowerCase() !== targetName.trim().toLowerCase(),
              ),
            );
          }

          return prev;
        });

        const candidateIndex = change.newRow
          ? candidateState.rows.findIndex((row) => row.fieldName === change.newRow?.fieldName)
          : rows.findIndex((row) => row.fieldName === change.oldRow?.fieldName);
        if (candidateIndex >= 0) {
          triggerFieldTableHighlight(candidateIndex);
        }
      }

      if (change.kind === 'index') {
        setActiveTab('indexes');
        if (change.type === 'add' && change.newIndex) {
          const nextIndex = change.newIndex;
          setIndexes((prev) => [...prev, nextIndex]);
          setTimeout(() => void triggerIndexAnimation(nextIndex.id, 'add'), 50);
        } else if (change.type === 'modify' && change.newIndex) {
          const nextIndex = change.newIndex;
          setIndexes((prev) =>
            prev.map((index) =>
              index.name.toLowerCase() === change.indexName.toLowerCase()
                ? { ...nextIndex, id: index.id }
                : index,
            ),
          );
          setTimeout(() => void triggerIndexAnimation(nextIndex.id, 'add'), 50);
        } else if (change.type === 'remove' && change.oldIndex) {
          void triggerIndexAnimation(change.oldIndex.id, 'remove');
          setTimeout(() => {
            setIndexes((prev) =>
              prev.filter((index) => index.name.toLowerCase() !== change.indexName.toLowerCase()),
            );
          }, 500);
        }
      }

      void trackEvent('ai_schema_patch_apply', {
        type: `${change.kind}:${change.type}`,
      });
    },
    [
      rows,
      setActiveTab,
      setIndexes,
      setRows,
      setSchemaName,
      setTableName,
      setTableComment,
      trackEvent,
      triggerFieldTableHighlight,
      triggerIndexAnimation,
    ],
  );

  const handleFocusAISchemaChange = useCallback(
    (change: AISchemaChange) => {
      if (change.kind === 'field') {
        setActiveTab('fields');
        const targetName = change.oldRow?.fieldName || change.newRow?.fieldName || change.fieldName;
        const rowIndex = rows.findIndex(
          (row) => row.fieldName.trim().toLowerCase() === targetName.trim().toLowerCase(),
        );
        if (rowIndex >= 0) {
          triggerFieldTableHighlight(rowIndex);
        }
      } else if (change.kind === 'index') {
        setActiveTab('indexes');
        const targetIndex =
          indexes.find((index) => index.name.toLowerCase() === change.indexName.toLowerCase()) ||
          change.newIndex ||
          change.oldIndex;
        if (targetIndex) {
          void triggerIndexAnimation(targetIndex.id, change.type === 'remove' ? 'remove' : 'add');
        }
      }
    },
    [indexes, rows, setActiveTab, triggerFieldTableHighlight, triggerIndexAnimation],
  );

  const { handleApplySuggestion, handleImport, handleApplyAIGeneratedSchema } =
    useSchemaApplyActions({
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
      trackEvent,
      onApplyAIGeneratedState: handleApplyAIGeneratedStateToDraft,
    });

  const {
    handleOpenSavedTablesDrawer,
    handleOpenDiffDialog,
    handleTabValueChange,
    handleOpenStorageEstimator,
    handleViewVersionHistory,
    handleOpenAIGenerateDialog,
    handleOpenMockDataGenerator,
    handleOpenErDiagram,
  } = useNavigationActions({
    setSavedTablesDrawerOpen,
    setIsDiffDialogOpen,
    setActiveTab,
    setIsStorageEstimatorOpen,
    setVersionHistoryTarget,
    setIsVersionHistoryOpen,
    setIsAIGenerateDialogOpen,
    setIsMockDataDialogOpen,
    setIsErDialogOpen,
    trackEvent,
  });

  const handleOpenAISchemaPatchPanel = useCallback(() => {
    if (tabs.length === 0 && !isShareView) {
      handleOpenAIGenerateDialog();
      return;
    }
    setIsAISchemaPatchOpen(true);
  }, [handleOpenAIGenerateDialog, isShareView, tabs.length]);

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
      applySavedState(state);
      setLoadedTableNormalizedName(null);
      setLoadedTableName(null);
      setLoadedTableSignature(null);
      setLoadedTableVersion(0);
      showToast(t('erDiagram.tableLoaded'));
    },
    [
      applySavedState,
      setLoadedTableNormalizedName,
      setLoadedTableName,
      setLoadedTableSignature,
      setLoadedTableVersion,
      showToast,
      t,
    ],
  );

  const handlePlayTimeline = useCallback(() => {
    if (versionHistoryTarget) {
      setTimelinePlayerTarget(versionHistoryTarget);
      setIsTimelinePlayerOpen(true);
    }
  }, [versionHistoryTarget, setTimelinePlayerTarget, setIsTimelinePlayerOpen]);

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
      const activeTab = getActiveTab();
      if (activeTab?.source.kind === 'draft') {
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

  const drawerDraftItems = useMemo(() => {
    return draftSummaries;
  }, [draftSummaries]);

  const tablePresentations = useMemo(() => {
    const presentations = new Map<string, { title: string; isDirty: boolean }>();
    for (const tab of tabs) {
      if (tab.source.kind === 'saved_table') {
        presentations.set(tab.source.normalizedName, {
          title: tab.title,
          isDirty: tab.isDirty,
        });
      }
    }
    return presentations;
  }, [tabs]);

  const isMainWorkspaceLoading = !hydrated || isSavedTableLoading;

  // ─── 7. Render ─────────────────────────────────────────────────
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
            void refreshSavedTables();
            setSavedTablesDrawerOpen(true);
          }}
          saveTable={saveTable}
          overwriteTable={overwriteTable}
          moveTableToFolder={moveTableToFolder}
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

        <SavedTablesContainer
          drawerProps={{
            open: savedTablesDrawerOpen,
            onOpenChange: setSavedTablesDrawerOpen,
            loading: savedTablesLoading,
            error: savedTablesError,
            items: savedTables,
            draftItems: drawerDraftItems,
            activeDraftId:
              !isShareView && activeSource.kind === 'draft' ? activeSource.draftId : null,
            folders: folderTree,
            foldersLoading: foldersLoading,
            activeNormalizedName: loadedTableNormalizedName,
            activeDirty: isLoadedDirty,
            tablePresentations,
            onSelectDraft: handleSelectDraft,
            onDeleteDraft: handleDeleteDraft,
            onSelect: handleSelectSavedTable,
            onRename: handleOpenRenameDialog,
            onDelete: handleOpenDeleteDialog,
            onViewHistory: handleViewVersionHistory,
            onMoveToFolder: handleMoveTableToFolder,
            onMoveFolder: handleMoveFolderToFolder,
            onCreateFolder: handleOpenCreateFolderDialog,
            onRenameFolder: handleOpenRenameFolderDialog,
            onDeleteFolder: handleOpenDeleteFolderDialog,
          }}
        />

        <div className="flex flex-col sm:flex-row">
          {!isShareView && (
            <WorkspaceSidebar
              open={workspaceSidebarOpen}
              loading={savedTablesLoading || foldersLoading}
              error={savedTablesError}
              items={savedTables}
              trashedItems={trashedTables}
              trashedDraftItems={trashedDrafts}
              draftItems={drawerDraftItems}
              folders={folderTree}
              activeNormalizedName={loadedTableNormalizedName}
              activeDraftId={activeSource.kind === 'draft' ? activeSource.draftId : null}
              activeDirty={isLoadedDirty}
              tablePresentations={tablePresentations}
              onToggle={() => setWorkspaceSidebarOpen((open) => !open)}
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

          <div className="min-w-0 flex-1">
            {!isShareView && (
              <TabBar
                tabs={tabs}
                activeTabId={activeTabId}
                onActivateTab={(id) => {
                  const tab = tabs.find((t) => t.id === id);
                  if (!tab || tab.id === activeTabId) return;
                  flushCurrentWorkspace();
                  activateTab(id);
                  applySavedState(tab.stateSnapshot);
                  setWorkspaceSnapshot(tab.source, tab.stateSnapshot);
                }}
                onCloseTab={handleCloseTab}
                onCreateTab={handleCreateDraft}
              />
            )}
            <div className="p-3 sm:p-4">
              {isMainWorkspaceLoading ? (
                <MainWorkspaceSkeleton />
              ) : tabs.length === 0 && !isShareView ? (
                <WorkspaceEmptyState
                  hasContent={draftSummaries.length > 0 || savedTables.length > 0}
                  onCreateNewTable={handleCreateDraft}
                  onLoadExample={handleLoadExample}
                  importButton={
                    <button
                      type="button"
                      onClick={() => setIsImportDialogOpen(true)}
                      className="flex items-center justify-center gap-2 rounded-lg border bg-background px-4 py-3 text-sm font-medium transition-colors hover:bg-accent"
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
                      triggerClassName="flex h-auto w-full items-center justify-center gap-2 rounded-lg border bg-background px-4 py-3 text-sm font-medium transition-colors hover:bg-accent"
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
                        saveDisabled: !canSaveCurrent,
                        saveDisabledHint: t('dialogs.save.disabledTip'),
                        showDiffButton: isLoadedDirty && tableDiff?.hasChanges,
                        showHistoryButton: Boolean(loadedTableNormalizedName),
                        loadedTableName,
                        workspaceLabel,
                        fieldCount: filledRowCount,
                        indexCount: indexes.length,
                      }}
                      objectType={objectType}
                      tabsValue={activeTab}
                      onTabsValueChange={handleTabValueChange}
                      filledRowCount={filledRowCount}
                      indexesLength={indexes.length}
                      indexStats={indexStats}
                      authObjectsLength={authObjects.length}
                      miscEnabled={tableMiscConfig.enabled}
                      showIndexTab={dbType !== 'hive'}
                      showForeignKeyTab={dbType !== 'hive'}
                      foreignKeysLength={foreignKeys.length}
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
                      showHivePartitionTab={dbType === 'hive'}
                      hivePartitionBadgeText={
                        tableMiscConfig.partitions?.enabled
                          ? `${tableMiscConfig.partitions.columns.length}`
                          : null
                      }
                      dataTableProps={{
                        isHighlighted: isFieldTableHighlighted,
                        highlightedRowIndex: highlightedRowIndex,
                        onOpenStorageEstimator: handleOpenStorageEstimator,
                        onOpenMockDataGenerator: handleOpenMockDataGenerator,
                        onOpenAISchemaPatch: handleOpenAISchemaPatchPanel,
                        onGenerateComments: handleGenerateComments,
                        isGeneratingComments,
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
                        onEnabledChange: (enabled) =>
                          setHivePartitionConfig((prev) => ({
                            ...(prev || { enabled: false, columns: [] }),
                            enabled,
                          })),
                        onAddColumn: (column) =>
                          setHivePartitionConfig((prev) => ({
                            ...(prev || { enabled: true, columns: [] }),
                            columns: [...(prev?.columns || []), column],
                          })),
                        onRemoveColumn: (index) =>
                          setHivePartitionConfig((prev) => ({
                            ...(prev || { enabled: false, columns: [] }),
                            columns: (prev?.columns || []).filter((_, i) => i !== index),
                          })),
                        onUpdateColumn: (index, column) =>
                          setHivePartitionConfig((prev) => ({
                            ...(prev || { enabled: false, columns: [] }),
                            columns: (prev?.columns || []).map((c, i) =>
                              i === index ? column : c,
                            ),
                          })),
                        onClusteringChange: (clustering) =>
                          setHivePartitionConfig((prev) => ({
                            ...(prev || { enabled: false, columns: [] }),
                            clustering,
                          })),
                      }}
                    />
                  </div>

                  <OutputContainer
                    open={outputPanelOpen}
                    onOpenChange={setOutputPanelOpen}
                    ddlOutputProps={{
                      generatedSql,
                      generatedDcl,
                      dbType,
                      routineTableNameDefault,
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
                </div>
              )}
            </div>
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
            title: saveDialog.data.queuedLoadAfterSave ? '加载保存的表' : saveDialogTitle,
            description: saveDialog.data.queuedLoadAfterSave
              ? '当前表有未保存修改。保存后会继续加载选中的表。'
              : saveDialogDescription,
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
            open: isDiffDialogOpen,
            onOpenChange: setIsDiffDialogOpen,
            tableName,
            dbType,
            diff: tableDiff,
            fields: normalizedFields,
            onCopy: () => showToast(t('app.copyDiffDone')),
          }}
          versionHistoryDialogProps={{
            open: isVersionHistoryOpen,
            onOpenChange: setIsVersionHistoryOpen,
            tableNormalizedName: versionHistoryTarget?.normalizedName ?? null,
            tableName: versionHistoryTarget?.name ?? null,
            currentState: currentPersistedState,
            onRollback: (state: PersistedState) => {
              applySavedState(state);
              setSavedTablesDrawerOpen(false);
              void trackEvent('table_version_rollback');
              showToast(t('app.rollbackDone'));
            },
            onPlayTimeline: handlePlayTimeline,
          }}
          timelinePlayerProps={{
            open: isTimelinePlayerOpen,
            onOpenChange: setIsTimelinePlayerOpen,
            tableNormalizedName: timelinePlayerTarget?.normalizedName ?? null,
            tableName: timelinePlayerTarget?.name ?? null,
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
              schemaName,
              tableName,
              tableComment,
              rows,
              indexes,
            },
            templates: [...templates, ...tableTemplates],
            onApply: handleApplyAIGeneratedSchema,
          }}
          storageEstimatorDialogProps={{
            open: isStorageEstimatorOpen,
            onOpenChange: setIsStorageEstimatorOpen,
            dbType,
            fields: normalizedFields,
            indexes,
            storageFormat: tableMiscConfig.storedAs || undefined,
          }}
          mockDataDialogProps={{
            open: isMockDataDialogOpen,
            onOpenChange: setIsMockDataDialogOpen,
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
          }}
          emptyTrashDialog={{
            open: isEmptyTrashDialogOpen,
            onOpenChange: setIsEmptyTrashDialogOpen,
            onConfirm: handleConfirmEmptyTrash,
          }}
        />

        <Dialog open={isAISchemaPatchOpen} onOpenChange={setIsAISchemaPatchOpen}>
          <DialogContent className="flex max-h-[86vh] w-[min(720px,calc(100vw-2rem))] max-w-none flex-col overflow-hidden p-0">
            <DialogTitle className="sr-only">{t('aiPatch.title')}</DialogTitle>
            <AISchemaPatchPanel
              dbType={dbType}
              currentState={currentPersistedState}
              templates={[...templates, ...tableTemplates]}
              onApplyChange={handleApplyAISchemaChange}
              onFocusChange={handleFocusAISchemaChange}
            />
          </DialogContent>
        </Dialog>

        {!isShareView && (
          <Suspense fallback={null}>
            <ImportSqlDialog
              currentDbType={dbType}
              onImport={handleImport}
              open={isImportDialogOpen}
              onOpenChange={setIsImportDialogOpen}
              hideTrigger
              savedTables={savedTables}
              folderTree={folderTree}
              saveTable={saveTable}
              overwriteTable={overwriteTable}
              moveTableToFolder={moveTableToFolder}
              onBatchImportComplete={refreshSavedTables}
            />
          </Suspense>
        )}
      </div>
    </TooltipProvider>
  );
}

export default App;
