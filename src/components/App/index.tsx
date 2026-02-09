import { useCallback, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
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
  buildDuplicateNameSet,
  buildNormalizedFields,
  useAppStore,
  useFieldStore,
  useIndexStore,
} from '@/stores';
import { useDialogState } from '@/hooks/useDialogState';
import { useFieldTemplates } from '@/hooks/useFieldTemplates';
import { ApplyTemplatePopover } from './ApplyTemplatePopover';
import { sanitizeIndexesForPersist } from '@/utils/indexUtils';
import {
  DEFAULT_SAVED_TABLE_NAME,
  normalizeSavedTableName,
} from '@/utils/savedTablesDb';
import { diffPersistedState, type TableDiff } from '@/utils/tableDiff';
import { createVersion } from '@/utils/tableVersions';
import { saveReview } from '@/utils/reviewHistory';
import { reportError } from '@/utils/errorReporter';

const FireworksOverlay = lazy(() => import('@/components/FireworksOverlay'));

const INITIAL_ROWS = Array.from({ length: 12 }, (_, index) =>
  createEmptyRow(index),
);
const DEFAULT_FIELD_TABLE_FREEZE_ENABLED = true;
const DEFAULT_FIELD_TABLE_FREEZE_COLUMNS = 3;

type AnalyticsValue = string | number | boolean | null | undefined;

function App() {
  const trackEvent = useCallback(
    async (event: string, data?: Record<string, AnalyticsValue>) => {
      const { track } = await import('@vercel/analytics');
      track(event, data);
    },
    [],
  );

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
  const queuedLoadAfterSave = saveDialog.data.queuedLoadAfterSave;
  const renameName = renameDialog.data.name;
  const renameError = renameDialog.error;
  const renameTarget = renameDialog.data.target;
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

  // Check for fireworks on mount
  useEffect(() => {
    const hasShown = localStorage.getItem('fireworks_shown_2026');
    if (!hasShown) {
      setShowFireworks(true);
    }
  }, [setShowFireworks]);

  const handleFireworksComplete = useCallback(() => {
    setShowFireworks(false);
    localStorage.setItem('fireworks_shown_2026', 'true');
  }, [setShowFireworks]);

  // Use custom hooks
  const { persistedState, hydrated, saveState, clearState } =
    usePersistedState();

  const rows = useFieldStore((state) => state.rows);
  const setRows = useFieldStore((state) => state.setRows);
  const initializeRows = useFieldStore((state) => state.initializeRows);
  const resetTableRows = useFieldStore((state) => state.resetRows);
  const handleRowsChange = useFieldStore((state) => state.handleRowsChange);
  const handleCreateRow = useFieldStore((state) => state.handleCreateRow);
  const handleRemoveRow = useFieldStore((state) => state.handleRemoveRow);
  const handleAddRows = useFieldStore((state) => state.handleAddRows);

  const duplicateNameSet = useMemo(() => buildDuplicateNameSet(rows), [rows]);
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
  const showFieldSuggestions = useIndexStore(
    (state) => state.showFieldSuggestions,
  );
  const selectedSuggestionIndex = useIndexStore(
    (state) => state.selectedSuggestionIndex,
  );
  const setIndexInput = useIndexStore((state) => state.setIndexInput);
  const setCurrentIndexFields = useIndexStore(
    (state) => state.setCurrentIndexFields,
  );
  const setShowFieldSuggestions = useIndexStore(
    (state) => state.setShowFieldSuggestions,
  );
  const setSelectedSuggestionIndex = useIndexStore(
    (state) => state.setSelectedSuggestionIndex,
  );
  const initializeIndexState = useIndexStore(
    (state) => state.initializeIndexState,
  );
  const addFieldToIndex = useIndexStore((state) => state.addFieldToIndex);
  const removeFieldFromIndex = useIndexStore(
    (state) => state.removeFieldFromIndex,
  );
  const toggleFieldDirection = useIndexStore(
    (state) => state.toggleFieldDirection,
  );
  const addIndex = useIndexStore((state) => state.addIndex);
  const removeIndex = useIndexStore((state) => state.removeIndex);
  const updateIndexName = useIndexStore((state) => state.updateIndexName);
  const updateIndexNames = useIndexStore((state) => state.updateIndexNames);
  const resetIndexState = useIndexStore((state) => state.resetIndexState);
  const setIndexes = useIndexStore((state) => state.setIndexes);

  const fieldSuggestions = useMemo(() => {
    if (!indexInput.trim()) return [];

    const input = indexInput.toLowerCase().trim();
    return availableFields.filter(
      (field) =>
        field.toLowerCase().includes(input) &&
        !currentIndexFields.some((item) => item.name === field),
    );
  }, [indexInput, availableFields, currentIndexFields]);

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
        nullable: row.nullable ? '是' : '否',
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

  const handleStartReview = useCallback(() => {
    trackEvent('sql_review_start', { dbType, tableName });
    startReview(generatedSql, tableName, dbType);
  }, [trackEvent, startReview, generatedSql, tableName, dbType]);

  const isReviewingRef = useRef(false);

  // 当评审完成时保存记录
  useEffect(() => {
    // 仅在评审状态从 true 变为 false 且有结果时保存
    if (isReviewingRef.current && !isReviewing && reviewResult) {
      const normalizedName =
        loadedTableNormalizedName || normalizeSavedTableName(tableName);
      saveReview(normalizedName, tableName, generatedSql, dbType, reviewResult)
        .then(() => trackEvent('sql_review_complete', { dbType, tableName }))
        .catch((err) =>
          reportError(err, {
            scope: 'App',
            action: 'saveReview',
            metadata: { dbType, tableName, normalizedName },
          }),
        );
    }
    isReviewingRef.current = isReviewing;
  }, [
    reviewResult,
    isReviewing,
    loadedTableNormalizedName,
    tableName,
    generatedSql,
    dbType,
    trackEvent,
  ]);

  const handleViewReviewHistory = useCallback(() => {
    setIsReviewHistoryOpen(true);
  }, [setIsReviewHistoryOpen]);

  const handleShare = useCallback(async () => {
    const currentState = buildPersistedState();
    try {
      const { compressState } = await import('@/utils/share');
      const compressed = compressState(currentState);
      const url = `${window.location.origin}${window.location.pathname}?s=${compressed}`;
      await navigator.clipboard.writeText(url);
      trackEvent('share_link_create');
      showToast('链接已复制到剪贴板');
    } catch (e) {
      reportError(e, {
        scope: 'App',
        action: 'generateShareLink',
      });
      showToast('生成链接失败');
    }
  }, [buildPersistedState, showToast, trackEvent]);

  // restore basic state from localStorage once on mount
  useEffect(() => {
    if (!hydrated || !persistedState) return;

    if (typeof persistedState.tableName === 'string')
      setTableName(persistedState.tableName);
    if (typeof persistedState.tableComment === 'string')
      setTableComment(persistedState.tableComment);
    if (
      persistedState.dbType === 'mysql' ||
      persistedState.dbType === 'postgresql' ||
      persistedState.dbType === 'postgresql-citus' ||
      persistedState.dbType === 'sqlserver' ||
      persistedState.dbType === 'oracle'
    ) {
      setDbType(persistedState.dbType);
    }
    if (
      typeof persistedState.addCount === 'number' &&
      Number.isFinite(persistedState.addCount)
    ) {
      setAddCount(Math.max(1, Math.floor(persistedState.addCount)));
    }
    initializeRows(persistedState.rows);
    initializeIndexState(persistedState);

    const persistedFieldTableViewConfig = persistedState.fieldTableViewConfig;
    if (persistedFieldTableViewConfig) {
      setFieldTableFreezeEnabled(
        persistedFieldTableViewConfig.freezeEnabled !== false,
      );
      const freezeColumns = persistedFieldTableViewConfig.freezeColumns;
      setFieldTableFreezeColumns(
        typeof freezeColumns === 'number' && Number.isFinite(freezeColumns)
          ? Math.max(1, Math.floor(freezeColumns))
          : DEFAULT_FIELD_TABLE_FREEZE_COLUMNS,
      );
    }
  }, [
    hydrated,
    persistedState,
    setTableName,
    setTableComment,
    setDbType,
    setAddCount,
    initializeRows,
    initializeIndexState,
    setFieldTableFreezeEnabled,
    setFieldTableFreezeColumns,
  ]);

  // save to localStorage on changes
  useEffect(() => {
    if (!hydrated) return;
    try {
      const payload = buildPersistedState();
      saveState(payload);
    } catch {
      // ignore quota errors
    }
  }, [hydrated, buildPersistedState, saveState]);

  const handleClearAll = useCallback(() => {
    setIsClearDialogOpen(true);
  }, [setIsClearDialogOpen]);

  const cancelClearAll = useCallback(() => {
    setIsClearDialogOpen(false);
  }, [setIsClearDialogOpen]);

  const confirmClearAll = useCallback(() => {
    resetTableConfig();
    resetTableViewConfig();
    resetTableRows();
    resetIndexState();
    resetAuthState();
    resetCitusSharding();
    resetPartition();
    resetTableMiscConfig();
    setLoadedTableNormalizedName(null);
    setLoadedTableName(null);
    setLoadedTableSignature(null);

    // Clear localStorage
    clearState();
    trackEvent('table_clear_all');

    cancelClearAll();
  }, [
    cancelClearAll,
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
  ]);

  const applySavedState = useCallback(
    (state: PersistedState) => {
      setTableName(state.tableName ?? '');
      setTableComment(state.tableComment ?? '');
      setDbType(state.dbType ?? 'mysql');

      if (
        typeof state.addCount === 'number' &&
        Number.isFinite(state.addCount)
      ) {
        setAddCount(Math.max(1, Math.floor(state.addCount)));
      } else {
        setAddCount(10);
      }

      setRows(state.rows ?? INITIAL_ROWS);
      setIndexes(state.indexes ?? []);
      setIndexInput(state.indexInput ?? '');
      setCurrentIndexFields(state.currentIndexFields ?? []);
      setAuthObjects(state.authObjects ?? []);
      setAuthInput(state.authInput ?? '');

      if (state.citusShardingConfig) {
        setCitusShardingConfig(state.citusShardingConfig);
      } else {
        resetCitusSharding();
      }

      if (state.mysqlPartitionConfig) {
        setMysqlPartitionConfig(state.mysqlPartitionConfig);
      } else {
        resetPartition();
      }

      if (state.tableMiscConfig) {
        setTableMiscConfig(state.tableMiscConfig);
      } else {
        resetTableMiscConfig();
      }

      if (state.fieldTableViewConfig) {
        setFieldTableFreezeEnabled(state.fieldTableViewConfig.freezeEnabled);
        const freezeColumns = state.fieldTableViewConfig.freezeColumns;
        setFieldTableFreezeColumns(
          typeof freezeColumns === 'number' && Number.isFinite(freezeColumns)
            ? Math.max(1, Math.floor(freezeColumns))
            : DEFAULT_FIELD_TABLE_FREEZE_COLUMNS,
        );
      } else {
        setFieldTableFreezeEnabled(DEFAULT_FIELD_TABLE_FREEZE_ENABLED);
        setFieldTableFreezeColumns(DEFAULT_FIELD_TABLE_FREEZE_COLUMNS);
      }
    },
    [
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
    ],
  );

  const handleLoadSavedTable = useCallback(
    async (target: SavedTableSummary) => {
      try {
        const record = await loadTable(target.normalizedName);
        if (!record) {
          showToast('未找到保存的表');
          return;
        }
        applySavedState(record.state);
        setLoadedTableNormalizedName(record.normalizedName);
        setLoadedTableName(record.name);
        setLoadedTableSignature(serializePersistedState(record.state));
        trackEvent('table_load', { tableName: record.name });
        showToast(`已加载：${record.name}`);
      } catch (error) {
        showToast(error instanceof Error ? error.message : '加载失败');
      }
    },
    [
      applySavedState,
      loadTable,
      showToast,
      serializePersistedState,
      setLoadedTableNormalizedName,
      setLoadedTableName,
      setLoadedTableSignature,
      trackEvent,
    ],
  );

  const openSaveDialog = useCallback(
    (queuedLoad?: SavedTableSummary | null) => {
      const defaultName =
        loadedTableName || tableName.trim() || DEFAULT_SAVED_TABLE_NAME;
      saveDialog.openDialog({
        name: defaultName,
        queuedLoadAfterSave: queuedLoad ?? null,
      });
    },
    [loadedTableName, tableName, saveDialog],
  );

  const handleConfirmSave = useCallback(async () => {
    if (!canSaveCurrent) {
      showToast('加载的表未修改，无法保存');
      return;
    }
    const nextState = buildPersistedState();
    const nextSignature = serializePersistedState(nextState);

    if (hasLoadedTable && loadedTableNormalizedName) {
      const result = await overwriteTable(loadedTableNormalizedName, nextState);
      if (!result.ok) {
        if (result.reason === 'not_found') {
          showToast('未找到保存的表');
          return;
        }
        showToast(result.message ?? '更新失败');
        return;
      }
      setLoadedTableSignature(nextSignature);
      trackEvent('table_update', { tableName: loadedTableName });
      showToast(`已更新：${loadedTableName ?? saveName}`);
      // 创建版本快照
      await createVersion(loadedTableNormalizedName, nextState);
    } else {
      const result = await saveTable(saveName, nextState);
      if (!result.ok) {
        if (result.reason === 'duplicate') {
          saveDialog.setError('名称已存在，请换一个');
          return;
        }
        showToast(result.message ?? '保存失败');
        return;
      }
      const displayName = saveName.trim() || DEFAULT_SAVED_TABLE_NAME;
      trackEvent('table_save', { tableName: displayName });
      showToast(`已保存：${displayName}`);
      // 创建初始版本快照
      const normalizedName =
        saveName.trim().toLowerCase() || DEFAULT_SAVED_TABLE_NAME.toLowerCase();
      await createVersion(normalizedName, nextState, '初始版本');
    }
    saveDialog.closeDialog();

    if (queuedLoadAfterSave) {
      await handleLoadSavedTable(queuedLoadAfterSave);
    }
  }, [
    canSaveCurrent,
    saveName,
    saveTable,
    overwriteTable,
    buildPersistedState,
    serializePersistedState,
    showToast,
    queuedLoadAfterSave,
    handleLoadSavedTable,
    hasLoadedTable,
    loadedTableNormalizedName,
    loadedTableName,
    setLoadedTableSignature,
    trackEvent,
    saveDialog,
  ]);

  const handleSaveDialogOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        saveDialog.closeDialog();
      }
    },
    [saveDialog],
  );

  const handleSelectSavedTable = useCallback(
    (item: SavedTableSummary) => {
      setSavedTablesDrawerOpen(false);
      if (hasLoadedTable && isLoadedDirty) {
        loadConfirmDialog.openDialog({ pendingTarget: item });
        return;
      }
      void handleLoadSavedTable(item);
    },
    [
      hasLoadedTable,
      isLoadedDirty,
      handleLoadSavedTable,
      loadConfirmDialog,
      setSavedTablesDrawerOpen,
    ],
  );

  const handleCancelLoadConfirm = useCallback(() => {
    loadConfirmDialog.closeDialog();
  }, [loadConfirmDialog]);

  const handleLoadConfirmOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        loadConfirmDialog.closeDialog();
      }
    },
    [loadConfirmDialog],
  );

  const handleConfirmLoadIgnore = useCallback(async () => {
    if (!pendingLoadTarget) return;
    loadConfirmDialog.closeDialog();
    await handleLoadSavedTable(pendingLoadTarget);
  }, [pendingLoadTarget, loadConfirmDialog, handleLoadSavedTable]);

  const handleConfirmLoadSave = useCallback(() => {
    if (!pendingLoadTarget) return;
    loadConfirmDialog.closeDialog();
    openSaveDialog(pendingLoadTarget);
  }, [pendingLoadTarget, loadConfirmDialog, openSaveDialog]);

  const handleOpenRenameDialog = useCallback(
    (item: SavedTableSummary) => {
      renameDialog.openDialog({
        name: item.name,
        target: item,
      });
    },
    [renameDialog],
  );

  const handleRenameDialogOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        renameDialog.closeDialog();
      }
    },
    [renameDialog],
  );

  const handleConfirmRename = useCallback(async () => {
    if (!renameTarget) return;
    const result = await renameTable(renameTarget.normalizedName, renameName);
    if (!result.ok) {
      if (result.reason === 'duplicate') {
        renameDialog.setError('名称已存在，请换一个');
        return;
      }
      showToast(result.message ?? '重命名失败');
      return;
    }
    const displayName = renameName.trim() || DEFAULT_SAVED_TABLE_NAME;
    trackEvent('table_rename', {
      oldName: renameTarget.name,
      newName: displayName,
    });
    showToast(`已重命名为：${displayName}`);
    if (
      loadedTableNormalizedName &&
      renameTarget.normalizedName === loadedTableNormalizedName
    ) {
      setLoadedTableNormalizedName(result.normalizedName);
      setLoadedTableName(displayName);
    }
    renameDialog.closeDialog();
  }, [
    renameTarget,
    renameName,
    renameTable,
    showToast,
    loadedTableNormalizedName,
    setLoadedTableNormalizedName,
    setLoadedTableName,
    trackEvent,
    renameDialog,
  ]);

  const handleOpenDeleteDialog = useCallback(
    (item: SavedTableSummary) => {
      deleteDialog.openDialog({ target: item });
    },
    [deleteDialog],
  );

  const handleDeleteDialogOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        deleteDialog.closeDialog();
      }
    },
    [deleteDialog],
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    const result = await deleteTable(deleteTarget.normalizedName);
    if (!result.ok) {
      showToast(result.message ?? '删除失败');
    } else {
      trackEvent('table_delete', { tableName: deleteTarget.name });
      showToast(`已删除：${deleteTarget.name}`);
      if (deleteTarget.normalizedName === loadedTableNormalizedName) {
        setLoadedTableNormalizedName(null);
        setLoadedTableName(null);
        setLoadedTableSignature(null);
      }
    }
    deleteDialog.closeDialog();
  }, [
    deleteTarget,
    deleteTable,
    showToast,
    loadedTableNormalizedName,
    setLoadedTableNormalizedName,
    setLoadedTableName,
    setLoadedTableSignature,
    trackEvent,
    deleteDialog,
  ]);

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

  const handleOpenSaveDialog = useCallback(() => {
    openSaveDialog(null);
  }, [openSaveDialog]);

  const handleOpenSavedTablesDrawer = useCallback(() => {
    trackEvent('sidebar_open');
    setSavedTablesDrawerOpen(true);
  }, [trackEvent, setSavedTablesDrawerOpen]);

  const handleOpenDiffDialog = useCallback(() => {
    trackEvent('diff_view_open');
    setIsDiffDialogOpen(true);
  }, [trackEvent, setIsDiffDialogOpen]);

  const handleTabValueChange = useCallback(
    (value: string) => {
      setActiveTab(value);
      trackEvent('tab_switch', { tab: value });
    },
    [setActiveTab, trackEvent],
  );

  const handleOpenStorageEstimator = useCallback(() => {
    trackEvent('storage_estimator_open');
    setIsStorageEstimatorOpen(true);
  }, [trackEvent, setIsStorageEstimatorOpen]);

  const handleViewVersionHistory = useCallback(
    (item: SavedTableSummary) => {
      setVersionHistoryTarget({
        normalizedName: item.normalizedName,
        name: item.name,
      });
      setIsVersionHistoryOpen(true);
    },
    [setVersionHistoryTarget, setIsVersionHistoryOpen],
  );

  const handleOpenAIGenerateDialog = useCallback(() => {
    setIsAIGenerateDialogOpen(true);
  }, [setIsAIGenerateDialogOpen]);

  const dataTableToolbarLeft = useMemo(
    () => (
      <ApplyTemplatePopover
        templates={templates}
        loading={templatesLoading}
        onApplyTemplate={handleApplyTemplate}
        onManageTemplates={handleManageTemplates}
        onSaveAsTemplate={handleSaveAsTemplate}
      />
    ),
    [
      templates,
      templatesLoading,
      handleApplyTemplate,
      handleManageTemplates,
      handleSaveAsTemplate,
    ],
  );

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

      <div className="flex flex-col gap-4 p-4">
        <div className="flex flex-col gap-4 lg:flex-row">
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
              rows,
              duplicateNameSet,
              dbType,
              addCount,
              onRowsChange: handleRowsChange as any,
              onCreateRow: handleCreateRow,
              onRemoveRow: handleRemoveRow,
              onAddRows: handleAddRows,
              onAddCountChange: setAddCount,
              freezeEnabled: fieldTableFreezeEnabled,
              freezeColumns: fieldTableFreezeColumns,
              onFreezeEnabledChange: setFieldTableFreezeEnabled,
              onFreezeColumnsChange: setFieldTableFreezeColumns,
              isHighlighted: isFieldTableHighlighted,
              highlightedRowIndex: highlightedRowIndex,
              onOpenStorageEstimator: handleOpenStorageEstimator,
              toolbarLeft: dataTableToolbarLeft,
            }}
            indexPanelProps={{
              indexInput,
              currentIndexFields,
              indexes,
              fieldSuggestions,
              showFieldSuggestions,
              selectedSuggestionIndex,
              onIndexInputChange: setIndexInput,
              onSetShowFieldSuggestions: setShowFieldSuggestions,
              onSetSelectedSuggestionIndex: setSelectedSuggestionIndex,
              onAddFieldToIndex: addFieldToIndex,
              onRemoveFieldFromIndex: removeFieldFromIndex,
              onToggleFieldDirection: toggleFieldDirection,
              onAddIndex: (unique, primary) =>
                addIndex(!!unique, !!primary, tableName, dbType),
              onRemoveIndex: removeIndex,
              onUpdateIndexName: (id, name) =>
                updateIndexName(id, name, dbType),
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
