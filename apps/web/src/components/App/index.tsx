import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import type { AICommentMode, DatabaseType, PersistedState } from '@ddlbuilder/shared-types';
import { createEmptyRow } from '@/utils/helpers';
import { isTabAvailable } from '@/utils/tabUtils';
import { Header } from './Header';
import { GlobalDialogs } from './containers/GlobalDialogs';
import { OutputContainer } from './containers/OutputContainer';
import { SavedTablesContainer } from './containers/SavedTablesContainer';
import { TableBuilderContainer } from './containers/TableBuilderContainer';
import { MainWorkspaceSkeleton } from './MainWorkspaceSkeleton';
import { DEFAULT_DRAFT_ID } from '@/utils/workspaceStateDb';
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
import { useFolders } from '@/hooks/useFolders';
import { useFieldTemplates } from '@/hooks/useFieldTemplates';
import { useTableTemplates } from '@/hooks/useTableTemplates';
import { countVersions } from '@/utils/tableVersions';
import { writeWorkspaceSession } from '@/utils/workspaceStateDb';
import { lintSchema } from '@/utils/schemaLint';
import { buildQualifiedTableName } from '@ddlbuilder/ddl-core';
import { useTranslation } from 'react-i18next';

import { TooltipProvider } from '@/components/ui/tooltip';
import { isCnyFireworksEnabled } from '@/config/featureFlags';

const FireworksOverlay = lazy(() => import('@/components/FireworksOverlay'));

const INITIAL_ROWS = Array.from({ length: 12 }, (_, index) => createEmptyRow(index));
const DEFAULT_FIELD_TABLE_FREEZE_ENABLED = true;
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
  } = usePersistedState();

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
    loadedStatus,
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
    saveState({ state, source, isDirty });
  }, [
    hydrated,
    isShareView,
    activeSource,
    buildPersistedState,
    serializePersistedState,
    saveState,
  ]);

  const [loadedTableVersion, setLoadedTableVersion] = useState<number>(0);
  const [isSavedTableLoading, setIsSavedTableLoading] = useState(false);
  const [isErDialogOpen, setIsErDialogOpen] = useState(false);

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
    handleSelectSavedTable,
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
    setWorkspaceSnapshot,
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
    },
  });

  const handleSelectDraft = useCallback(
    (draftId: string) => {
      flushCurrentWorkspace();
      setSavedTablesDrawerOpen(false);
      const existedDraftState = getDraftState(draftId);
      const nextState = existedDraftState ?? createEmptyGlobalDraftState();

      setWorkspaceSnapshot?.({ kind: 'draft', draftId }, nextState);
      applySavedState(nextState);

      setLoadedTableNormalizedName(null);
      setLoadedTableName(null);
      setLoadedTableSignature(null);
      setLoadedTableVersion(0);

      showToast(existedDraftState ? t('app.loadedDraft') : t('app.emptyDraftCreated'));
    },
    [
      flushCurrentWorkspace,
      setSavedTablesDrawerOpen,
      getDraftState,
      setWorkspaceSnapshot,
      applySavedState,
      setLoadedTableNormalizedName,
      setLoadedTableName,
      setLoadedTableSignature,
      showToast,
      t,
    ],
  );

  const handleCreateDraft = useCallback(() => {
    const draftId = `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const emptyState = createEmptyGlobalDraftState();
    createDraft(draftId, emptyState);
    handleSelectDraft(draftId);
  }, [createDraft, handleSelectDraft]);

  const handleDeleteDraft = useCallback(
    (draftId: string) => {
      deleteDraftById(draftId);
      showToast(t('app.draftDeleted'));
    },
    [deleteDraftById, showToast, t],
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
      setTableMiscConfig,
      setMysqlPartitionConfig,
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
    if (draftSummaries.length > 0) return draftSummaries;
    return [
      {
        draftId: DEFAULT_DRAFT_ID,
        name: t('app.workspace.unnamedDraft'),
        dbType: 'mysql' as const,
        fieldCount: 0,
        updatedAt: Date.now(),
      },
    ];
  }, [draftSummaries, t]);

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
            void savedTables.refresh();
            setSavedTablesDrawerOpen(true);
          }}
          saveTable={saveTable}
          overwriteTable={overwriteTable}
          moveTableToFolder={moveTableToFolder}
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
            onSelectDraft: handleSelectDraft,
            onCreateDraft: handleCreateDraft,
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

        <div className="flex flex-col gap-3 p-3 sm:gap-4 sm:p-4">
          {isMainWorkspaceLoading ? (
            <MainWorkspaceSkeleton />
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
                    onTableNameChange: setTableName,
                    onTableCommentChange: setTableComment,
                    onObjectTypeChange: (value) => {
                      setObjectType(value);
                      setActiveTab('fields');
                    },
                    onDbTypeChange: handleDbTypeChange,
                    onClearAll: handleClearAll,
                    onSaveTable: handleOpenSaveDialog,
                    onOpenSavedTables: handleOpenSavedTablesDrawer,
                    onViewDiff: handleOpenDiffDialog,
                    onOpenAIGenerate: handleOpenAIGenerateDialog,
                    onOpenErDiagram: handleOpenErDiagram,
                    saveDisabled: !canSaveCurrent,
                    saveDisabledHint: t('dialogs.save.disabledTip'),
                    showDiffButton: isLoadedDirty && tableDiff?.hasChanges,
                    loadedStatus,
                    loadedTableName,
                    workspaceLabel,
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
                        columns: (prev?.columns || []).map((c, i) => (i === index ? column : c)),
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
        />
      </div>
    </TooltipProvider>
  );
}

export default App;
