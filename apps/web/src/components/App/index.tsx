import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import type { AICommentMode, DatabaseType, PersistedState } from '@ddlbuilder/shared-types';
import { createEmptyRow } from '@/utils/helpers';
import { isTabAvailable } from '@/utils/tabUtils';
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
import { useTabStore } from '@/stores';
import { isWorkspaceTabDirty } from '@/stores/tabStore';
import { useAppSelectors } from './hooks/useAppSelectors';
import { useDialogStates } from './hooks/useDialogStates';
import { useDerivedTableState } from './hooks/useDerivedTableState';
import { useFolderActions } from './hooks/useFolderActions';
import { useTemplateActions } from './hooks/useTemplateActions';
import { useTableTemplateActions } from './hooks/useTableTemplateActions';
import { useSchemaApplyActions } from './hooks/useSchemaApplyActions';
import { useSavedTableFlowActions } from './hooks/useSavedTableFlowActions';
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
import { useWorkspaceScope } from '@/hooks/useWorkspaceScope';
import { useFieldTemplates } from '@/hooks/useFieldTemplates';
import { useTableTemplates } from '@/hooks/useTableTemplates';
import { countVersions } from '@/utils/tableVersions';
import { writeWorkspaceSession } from '@/utils/workspaceStateDb';
import { lintSchema } from '@/utils/schemaLint';
import { buildQualifiedTableName } from '@ddlbuilder/ddl-core';
import { EXAMPLE_USER_PROFILE_TABLE } from '@/utils/exampleTable';
import { useTranslation } from 'react-i18next';

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { TooltipProvider } from '@/components/ui/tooltip';
import { isCnyFireworksEnabled } from '@/config/featureFlags';

const FireworksOverlay = lazy(() => import('@/components/FireworksOverlay'));
const ImportSqlDialog = lazy(() =>
  import('@/components/ImportSqlDialog').then((module) => ({
    default: module.ImportSqlDialog,
  })),
);

const createInitialRows = () => Array.from({ length: 12 }, () => createEmptyRow());

const SHARE_COPY_SAVED_TOAST_KEY = 'ddlbuilder:share:copy-saved:v1';

const createEmptyGlobalDraftState = (): PersistedState => ({
  schemaName: '',
  tableName: '',
  tableComment: '',
  dbType: 'mysql',
  sqlFormatMode: 'compact',
  rows: createInitialRows(),
  addCount: 10,
  indexInput: '',
  currentIndexFields: [],
  indexes: [],
  authInput: '',
  authObjects: [],
});

function App() {
  const { t } = useTranslation();
  const workspaceScope = useWorkspaceScope();

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
    activeTab,
    setActiveTab,
    resetTableConfig,
    resetTableViewConfig,
    fieldTableFreezeEnabled,
    fieldTableFreezeColumns,
    setIsClearDialogOpen,
    showFireworks,
    setShowFireworks,
    savedTablesDrawerOpen,
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
  } = useAuthManagement();
  const activeWorkspaceTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? null,
    [activeTabId, tabs],
  );
  const activeTabSnapshot = activeWorkspaceTab?.stateSnapshot ?? null;

  const { citusShardingConfig, setCitusMode, setDistributionColumn, resetCitusSharding } =
    useCitusSharding();

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
  } = useMysqlPartition();

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
  } = useTableOptions();

  const qualifiedTableName = useMemo(
    () => buildQualifiedTableName(schemaName, tableName),
    [schemaName, tableName],
  );

  // ─── 4. Derived / computed state ───────────────────────────────
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

  const { showToast, error: showErrorToast } = useToast();
  const { isLoading: isGeneratingComments, generateComments } = useAIComments();
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
  } = useIndexAdvisorFlow({
    dbType,
    schemaName,
    tableName,
    tableComment,
    fields: normalizedFields,
    indexes,
    setIndexes,
    setActiveTab,
  });

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

  useEffect(() => {
    if (!persistenceFailure) return;
    showErrorToast(t('app.persistenceFailed'), {
      id: 'workspace-persistence-failure',
      action: {
        label: t('app.retryPersistence'),
        onClick: retryPersistence,
      },
    });
  }, [persistenceFailure, retryPersistence, showErrorToast, t]);

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

  const { handleShare, isSharing } = useShareAction({
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
  });

  const flushCurrentWorkspace = useCallback(() => {
    if (!hydrated || isShareView) return;
    const state = currentPersistedState;
    const source = activeSource;
    const currentSignature = serializePersistedState(state);

    const tabSnapshotSignature = activeTabSnapshot
      ? serializePersistedState(activeTabSnapshot)
      : null;

    if (tabSnapshotSignature === currentSignature) return;

    updateActiveTabSnapshot(state);
    saveState({ state, source });
  }, [
    hydrated,
    isShareView,
    activeSource,
    currentPersistedState,
    serializePersistedState,
    activeTabSnapshot,
    updateActiveTabSnapshot,
    saveState,
  ]);

  const [loadedTableVersion, setLoadedTableVersion] = useState<number>(0);
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
    loadedTableSource,
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
    flushCurrentWorkspace,
    getSavedTableDraft,
    setWorkspaceSnapshot,
    renameSavedTableDraft,
    removeSavedTableDraft,
    onSaveSuccess: async ({ normalizedName, displayName, baseSignature, mode }) => {
      if (isShareView) {
        try {
          if (!workspaceScope) throw new Error('工作区未就绪');
          await writeWorkspaceSession(
            {
              activeSource: {
                kind: 'saved_table',
                normalizedName,
              },
              updatedAt: Date.now(),
            },
            workspaceScope,
          );
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
      updateActiveTabSnapshot(buildPersistedState());
    },
    onTabRename: (fromNormalizedName, _toNormalizedName, newTitle) => {
      updateTabTitleBySource(
        {
          kind: 'saved_table',
          normalizedName: fromNormalizedName,
        },
        newTitle,
      );
    },
    onTabRemove: (normalizedName) => {
      removeTabBySource({
        kind: 'saved_table',
        normalizedName,
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
      });
      if (existingTab) {
        activateTab(existingTab.id);
        applySavedState(existingTab.stateSnapshot);
        selectWorkspaceSnapshot(existingTab.source, existingTab.stateSnapshot);
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
          updateActiveTabSnapshot(result.state);
        }
      } else {
        // 用户已切换到其他标签页，恢复当前激活标签页的状态
        const currentTab = getActiveTab();
        if (currentTab) {
          applySavedState(currentTab.stateSnapshot);
          selectWorkspaceSnapshot(currentTab.source, currentTab.stateSnapshot);
        }
      }
      setTabLoading(newTabId, false);
    },
    [
      flushCurrentWorkspace,
      setSavedTablesDrawerOpen,
      findTabBySource,
      activateTab,
      selectWorkspaceSnapshot,
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
        selectWorkspaceSnapshot(existingTab.source, existingTab.stateSnapshot);
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
      });
      activateTab(newTabId);
      applySavedState(nextState);
      selectWorkspaceSnapshot({ kind: 'draft', draftId }, nextState);

      showToast(existedDraftState ? t('app.loadedDraft') : t('app.emptyDraftCreated'));
    },
    [
      flushCurrentWorkspace,
      setSavedTablesDrawerOpen,
      findTabBySource,
      activateTab,
      selectWorkspaceSnapshot,
      getDraftState,
      draftSummaries,
      addTab,
      showToast,
      t,
      tabs,
    ],
  );

  const openStateInNewDraftTab = useCallback(
    (initialState: PersistedState) => {
      if (tabs.length > 0) {
        flushCurrentWorkspace();
      }
      const draftId = `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const uniqueName = createDraft(draftId, initialState);
      const finalState =
        uniqueName === initialState.tableName
          ? initialState
          : { ...initialState, tableName: uniqueName };

      const newTabId = addTab({
        title: uniqueName,
        source: { kind: 'draft', draftId },
        stateSnapshot: finalState,
      });
      activateTab(newTabId);
      applySavedState(finalState);
      setWorkspaceSnapshot({ kind: 'draft', draftId }, finalState);
    },
    [tabs.length, flushCurrentWorkspace, createDraft, addTab, activateTab, setWorkspaceSnapshot],
  );

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
    applyState: openStateInNewDraftTab,
    createTemplate: createTableTemplate,
    showToast,
  });

  const handleCreateDraft = useCallback(() => {
    openStateInNewDraftTab(createEmptyGlobalDraftState());
  }, [openStateInNewDraftTab]);

  const handleLoadExample = useCallback(() => {
    openStateInNewDraftTab(EXAMPLE_USER_PROFILE_TABLE);
    showToast(t('emptyState.exampleLoaded'));
  }, [openStateInNewDraftTab, showToast, t]);

  const handleCloseTab = useCallback(
    (tabId: string) => {
      if (tabId === activeTabId) {
        flushCurrentWorkspace();
      }
      closeTabStore(tabId);

      const nextActive = getActiveTab();
      if (nextActive) {
        applySavedState(nextActive.stateSnapshot);
        selectWorkspaceSnapshot(nextActive.source, nextActive.stateSnapshot);
      }
    },
    [activeTabId, closeTabStore, flushCurrentWorkspace, getActiveTab, selectWorkspaceSnapshot],
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

  const { applyChange: handleApplyAISchemaChange, focusChange: handleFocusAISchemaChange } =
    useAISchemaPatchFlow({
      rows,
      indexes,
      setRows,
      setIndexes,
      setSchemaName,
      setTableName,
      setTableComment,
      setActiveTab,
      highlightField: triggerFieldTableHighlight,
      animateIndex: triggerIndexAnimation,
    });

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
      onApplyAIGeneratedState: openStateInNewDraftTab,
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
    setIsAIGenerateDialogOpen,
    setIsMockDataDialogOpen,
    setIsErDialogOpen,
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
      openStateInNewDraftTab(state);
      showToast(t('erDiagram.tableLoaded'));
    },
    [openStateInNewDraftTab, showToast, t],
  );

  // 下面这些回调与派生值原先写在 GlobalDialogs 的 props 字面量里，每次渲染都是新引用，
  // 让各对话框的 memo 全部失配——关闭状态下也要跑完整个组件体（合计约 80 个 hook）。
  const handleSaveNameChange = useCallback(
    (value: string) => {
      saveDialog.updateData((prev) => ({ ...prev, name: value }));
      if (saveError) saveDialog.clearError();
    },
    [saveDialog, saveError],
  );

  const handleRenameNameChange = useCallback(
    (value: string) => {
      renameDialog.updateData((prev) => ({ ...prev, name: value }));
      if (renameError) renameDialog.clearError();
    },
    [renameDialog, renameError],
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

  const recentDrafts = useMemo(
    () => [...draftSummaries].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3),
    [draftSummaries],
  );

  const recentTables = useMemo(
    () => [...savedTables].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3),
    [savedTables],
  );

  const presentedTabs = useMemo(
    () =>
      tabs.map((tab) =>
        tab.id === activeTabId
          ? {
              ...tab,
              isDirty: activeSource.kind === 'saved_table' && isLoadedDirty,
            }
          : tab,
      ),
    [activeSource.kind, activeTabId, isLoadedDirty, tabs],
  );

  const tablePresentations = useMemo(() => {
    const presentations = new Map<string, { title: string; isDirty: boolean }>();
    for (const tab of presentedTabs) {
      if (tab.source.kind === 'saved_table') {
        presentations.set(tab.source.normalizedName, {
          title: tab.title,
          isDirty: isWorkspaceTabDirty(tab),
        });
      }
    }
    return presentations;
  }, [presentedTabs]);

  const shouldShowWorkspaceSkeleton =
    activeWorkspaceTab?.isLoading === true || (isShareView && !hydrated);

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
                onActivateTab={(id) => {
                  const tab = tabs.find((t) => t.id === id);
                  if (!tab || tab.id === activeTabId) return;
                  flushCurrentWorkspace();
                  activateTab(id);
                  applySavedState(tab.stateSnapshot);
                  selectWorkspaceSnapshot(tab.source, tab.stateSnapshot);
                }}
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
                onApplyChange={handleApplyAISchemaChange}
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
                saveTable={saveTable}
                overwriteTable={overwriteTable}
                moveTableToFolder={moveTableToFolder}
                onBatchImportComplete={refreshSavedTables}
              />
            </DialogRenderGuard>
          </Suspense>
        )}
      </div>
    </TooltipProvider>
  );
}

export default App;
