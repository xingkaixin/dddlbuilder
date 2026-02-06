import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
  lazy,
  Suspense,
} from 'react';
import type {
  DatabaseType,
  FieldRow,
  PersistedState,
  IndexDefinition,
} from '@/types';
import type { ParsedResult } from '@/utils/SqlParser';
import { createEmptyRow } from '@/utils/helpers';
import { Header } from './Header';
import { TableConfig } from './TableConfig';
import { IndexPanel } from './IndexPanel';
import { AuthPanel } from './AuthPanel';
import { ShardingPanel } from './ShardingPanel';
import { PartitionPanel } from './PartitionPanel';
import { TableOptionsPanel } from './TableOptionsPanel';
import { DataTable } from './DataTable';
import { DDLOutput } from './DDLOutput';
import { SavedTablesDrawer } from './SavedTablesDrawer';
import { DiffDialog } from './DiffDialog';
import { VersionHistoryDialog } from './VersionHistoryDialog';
import { ReviewHistoryDialog } from './ReviewHistoryDialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePersistedState } from '@/hooks/usePersistedState';
import { useTableData } from '@/hooks/useTableData';
import { useIndexManagement } from '@/hooks/useIndexManagement';
import { useAuthManagement } from '@/hooks/useAuthManagement';
import { useSqlGeneration } from '@/hooks/useSqlGeneration';
import { useToast } from '@/hooks/useToast';
import { useCitusSharding } from '@/hooks/useCitusSharding';
import { useMysqlPartition } from '@/hooks/useMysqlPartition';
import { useTableOptions } from '@/hooks/useTableOptions';
import { useDDLReview, type StructuredSuggestion } from '@/hooks/useDDLReview';
import { useSuggestionAnimation } from '@/hooks/useSuggestionAnimation';
import { useSavedTables, type SavedTableSummary } from '@/hooks/useSavedTables';
import { useFolders, type FolderTreeNode } from '@/hooks/useFolders';
import {
  useFieldTemplates,
  type FieldTemplate,
} from '@/hooks/useFieldTemplates';
import { FolderDialog, DeleteFolderDialog } from './FolderDialogs';
import {
  TemplateManagerDialog,
  CreateTemplateDialog,
} from './TemplateManagerDialog';
import { ApplyTemplatePopover } from './ApplyTemplatePopover';
import { StorageEstimatorDialog } from './StorageEstimatorDialog';
import { sanitizeIndexesForPersist } from '@/utils/indexUtils';
import {
  DEFAULT_SAVED_TABLE_NAME,
  normalizeSavedTableName,
} from '@/utils/savedTablesDb';
import { diffPersistedState, type TableDiff } from '@/utils/tableDiff';
import { createVersion } from '@/utils/tableVersions';
import { saveReview } from '@/utils/reviewHistory';
import {
  Columns3Cog,
  Network,
  ShieldUser,
  Key,
  Lock,
  Hash,
  Share2,
  Layers,
  SlidersHorizontal,
} from 'lucide-react';

const FireworksOverlay = lazy(() => import('@/components/FireworksOverlay'));

const INITIAL_ROWS = Array.from({ length: 12 }, (_, index) =>
  createEmptyRow(index),
);

type AnalyticsValue = string | number | boolean | null | undefined;

function App() {
  const trackEvent = useCallback(
    async (event: string, data?: Record<string, AnalyticsValue>) => {
      const { track } = await import('@vercel/analytics');
      track(event, data);
    },
    [],
  );

  // Basic state
  const [tableName, setTableName] = useState('');
  const [tableComment, setTableComment] = useState('');
  const [dbType, setDbType] = useState<DatabaseType>('mysql');
  const [addCount, setAddCount] = useState<number>(10);

  // Changelog modal state
  const [showChangelog, setShowChangelog] = useState(false);
  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);

  // Fireworks state
  const [showFireworks, setShowFireworks] = useState(false);

  // Active tab state for controlled Tabs
  const [activeTab, setActiveTab] = useState<string>('fields');

  // Saved tables drawer & dialogs
  const [savedTablesDrawerOpen, setSavedTablesDrawerOpen] = useState(false);
  const [loadedTableNormalizedName, setLoadedTableNormalizedName] = useState<
    string | null
  >(null);
  const [loadedTableName, setLoadedTableName] = useState<string | null>(null);
  const [loadedTableSignature, setLoadedTableSignature] = useState<
    string | null
  >(null);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveError, setSaveError] = useState('');
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [renameName, setRenameName] = useState('');
  const [renameError, setRenameError] = useState('');
  const [renameTarget, setRenameTarget] = useState<SavedTableSummary | null>(
    null,
  );
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SavedTableSummary | null>(
    null,
  );
  const [isLoadConfirmOpen, setIsLoadConfirmOpen] = useState(false);
  const [pendingLoadTarget, setPendingLoadTarget] =
    useState<SavedTableSummary | null>(null);
  const [queuedLoadAfterSave, setQueuedLoadAfterSave] =
    useState<SavedTableSummary | null>(null);

  // Diff dialog state
  const [isDiffDialogOpen, setIsDiffDialogOpen] = useState(false);

  // Version history dialog state
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false);
  const [versionHistoryTarget, setVersionHistoryTarget] = useState<{
    normalizedName: string;
    name: string;
  } | null>(null);

  // Review history dialog state
  const [isReviewHistoryOpen, setIsReviewHistoryOpen] = useState(false);

  // Storage estimator dialog state
  const [isStorageEstimatorOpen, setIsStorageEstimatorOpen] = useState(false);

  // Check for fireworks on mount
  useEffect(() => {
    const hasShown = localStorage.getItem('fireworks_shown_2026');
    if (!hasShown) {
      setShowFireworks(true);
    }
  }, []);

  const handleFireworksComplete = useCallback(() => {
    setShowFireworks(false);
    localStorage.setItem('fireworks_shown_2026', 'true');
  }, []);

  // Use custom hooks
  const { persistedState, hydrated, saveState, clearState } =
    usePersistedState();

  const {
    rows,
    duplicateNameSet,
    normalizedFields,
    resetTableRows,
    handleRowsChange,
    handleCreateRow,
    handleRemoveRow,
    handleAddRows,
    setRows,
  } = useTableData(INITIAL_ROWS, persistedState?.rows);

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

  const {
    indexInput,
    currentIndexFields,
    indexes,
    fieldSuggestions,
    showFieldSuggestions,
    selectedSuggestionIndex,
    setIndexInput,
    setCurrentIndexFields,
    setShowFieldSuggestions,
    setSelectedSuggestionIndex,
    addFieldToIndex,
    removeFieldFromIndex,
    toggleFieldDirection,
    addIndex,
    removeIndex,
    updateIndexName,
    resetIndexState,
    setIndexes,
  } = useIndexManagement(
    tableName,
    availableFields,
    persistedState || undefined,
    dbType,
  );

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

  // Folder dialog state
  const [isFolderDialogOpen, setIsFolderDialogOpen] = useState(false);
  const [folderDialogMode, setFolderDialogMode] = useState<'create' | 'rename'>(
    'create',
  );
  const [folderDialogParent, setFolderDialogParent] =
    useState<FolderTreeNode | null>(null);
  const [folderDialogTarget, setFolderDialogTarget] =
    useState<FolderTreeNode | null>(null);

  // Delete folder dialog state
  const [isDeleteFolderDialogOpen, setIsDeleteFolderDialogOpen] =
    useState(false);
  const [deleteFolderTarget, setDeleteFolderTarget] =
    useState<FolderTreeNode | null>(null);

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

  // Template manager dialog state
  const [isTemplateManagerOpen, setIsTemplateManagerOpen] = useState(false);

  // Create template dialog state (from selected fields)
  const [isCreateTemplateDialogOpen, setIsCreateTemplateDialogOpen] =
    useState(false);
  const [selectedFieldsForTemplate, setSelectedFieldsForTemplate] = useState<
    typeof rows
  >([]);

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
        .catch((err) => console.error('Failed to save review:', err));
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
  }, []);

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
      console.error('Failed to generate share link', e);
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
  }, [hydrated, persistedState]);

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
  }, []);

  const cancelClearAll = useCallback(() => {
    setIsClearDialogOpen(false);
  }, []);

  const confirmClearAll = useCallback(() => {
    setTableName('');
    setTableComment('');
    setDbType('mysql');
    setAddCount(10);
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
    resetTableRows,
    resetIndexState,
    resetAuthState,
    resetCitusSharding,
    resetPartition,
    resetTableMiscConfig,
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
      trackEvent,
    ],
  );

  const openSaveDialog = useCallback(
    (queuedLoad?: SavedTableSummary | null) => {
      const defaultName =
        loadedTableName || tableName.trim() || DEFAULT_SAVED_TABLE_NAME;
      setSaveName(defaultName);
      setSaveError('');
      setIsSaveDialogOpen(true);
      setQueuedLoadAfterSave(queuedLoad ?? null);
    },
    [loadedTableName, tableName],
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
          setSaveError('名称已存在，请换一个');
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
    setIsSaveDialogOpen(false);
    setSaveError('');

    if (queuedLoadAfterSave) {
      const target = queuedLoadAfterSave;
      setQueuedLoadAfterSave(null);
      await handleLoadSavedTable(target);
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
    trackEvent,
  ]);

  const handleSaveDialogOpenChange = useCallback((open: boolean) => {
    setIsSaveDialogOpen(open);
    if (!open) {
      setSaveError('');
      setQueuedLoadAfterSave(null);
    }
  }, []);

  const handleSelectSavedTable = useCallback(
    (item: SavedTableSummary) => {
      setSavedTablesDrawerOpen(false);
      if (hasLoadedTable && isLoadedDirty) {
        setPendingLoadTarget(item);
        setIsLoadConfirmOpen(true);
        return;
      }
      void handleLoadSavedTable(item);
    },
    [hasLoadedTable, isLoadedDirty, handleLoadSavedTable],
  );

  const handleCancelLoadConfirm = useCallback(() => {
    setIsLoadConfirmOpen(false);
    setPendingLoadTarget(null);
  }, []);

  const handleLoadConfirmOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        setIsLoadConfirmOpen(true);
        return;
      }
      handleCancelLoadConfirm();
    },
    [handleCancelLoadConfirm],
  );

  const handleConfirmLoadIgnore = useCallback(async () => {
    if (!pendingLoadTarget) return;
    setIsLoadConfirmOpen(false);
    await handleLoadSavedTable(pendingLoadTarget);
    setPendingLoadTarget(null);
  }, [pendingLoadTarget, handleLoadSavedTable]);

  const handleConfirmLoadSave = useCallback(() => {
    if (!pendingLoadTarget) return;
    setIsLoadConfirmOpen(false);
    openSaveDialog(pendingLoadTarget);
    setPendingLoadTarget(null);
  }, [pendingLoadTarget, openSaveDialog]);

  const handleOpenRenameDialog = useCallback((item: SavedTableSummary) => {
    setRenameTarget(item);
    setRenameName(item.name);
    setRenameError('');
    setIsRenameDialogOpen(true);
  }, []);

  const handleRenameDialogOpenChange = useCallback((open: boolean) => {
    setIsRenameDialogOpen(open);
    if (!open) {
      setRenameTarget(null);
      setRenameError('');
    }
  }, []);

  const handleConfirmRename = useCallback(async () => {
    if (!renameTarget) return;
    const result = await renameTable(renameTarget.normalizedName, renameName);
    if (!result.ok) {
      if (result.reason === 'duplicate') {
        setRenameError('名称已存在，请换一个');
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
    setIsRenameDialogOpen(false);
    setRenameTarget(null);
    setRenameError('');
  }, [
    renameTarget,
    renameName,
    renameTable,
    showToast,
    loadedTableNormalizedName,
    trackEvent,
  ]);

  const handleOpenDeleteDialog = useCallback((item: SavedTableSummary) => {
    setDeleteTarget(item);
    setIsDeleteDialogOpen(true);
  }, []);

  const handleDeleteDialogOpenChange = useCallback((open: boolean) => {
    setIsDeleteDialogOpen(open);
    if (!open) {
      setDeleteTarget(null);
    }
  }, []);

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
    setIsDeleteDialogOpen(false);
    setDeleteTarget(null);
  }, [
    deleteTarget,
    deleteTable,
    showToast,
    loadedTableNormalizedName,
    trackEvent,
  ]);

  // Folder handlers
  const handleOpenCreateFolderDialog = useCallback(
    (parentId?: string) => {
      const parent = parentId
        ? (folderTree.find((f) => f.id === parentId) ?? null)
        : null;
      setFolderDialogParent(parent);
      setFolderDialogTarget(null);
      setFolderDialogMode('create');
      setIsFolderDialogOpen(true);
    },
    [folderTree],
  );

  const handleOpenRenameFolderDialog = useCallback((folder: FolderTreeNode) => {
    setFolderDialogParent(null);
    setFolderDialogTarget(folder);
    setFolderDialogMode('rename');
    setIsFolderDialogOpen(true);
  }, []);

  const handleOpenDeleteFolderDialog = useCallback((folder: FolderTreeNode) => {
    setDeleteFolderTarget(folder);
    setIsDeleteFolderDialogOpen(true);
  }, []);

  const handleFolderDialogConfirm = useCallback(
    async (name: string) => {
      if (folderDialogMode === 'create') {
        await createFolder(name, folderDialogParent?.id);
        showToast(`已创建文件夹：${name}`);
      } else if (folderDialogTarget) {
        await renameFolder(folderDialogTarget.id, name);
        showToast(`已重命名为：${name}`);
      }
    },
    [
      folderDialogMode,
      folderDialogParent,
      folderDialogTarget,
      createFolder,
      renameFolder,
      showToast,
    ],
  );

  const handleDeleteFolderConfirm = useCallback(async () => {
    if (!deleteFolderTarget) return;
    try {
      const affectedFolderIds = await deleteFolderAction(deleteFolderTarget.id);
      // Clear folderId from tables in deleted folders
      await clearTablesFromFolders(affectedFolderIds);
      showToast(`已删除文件夹：${deleteFolderTarget.name}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : '删除失败');
    }
  }, [
    deleteFolderTarget,
    deleteFolderAction,
    clearTablesFromFolders,
    showToast,
  ]);

  // Calculate table count for delete folder dialog
  const deleteFolderTableCount = useMemo(() => {
    if (!deleteFolderTarget) return 0;
    return savedTables.filter((t) => t.folderId === deleteFolderTarget.id)
      .length;
  }, [deleteFolderTarget, savedTables]);

  const handleMoveTableToFolder = useCallback(
    async (item: SavedTableSummary, folderId?: string) => {
      const result = await moveTableToFolder(item.normalizedName, folderId);
      if (result.ok) {
        showToast(folderId ? '已移动到文件夹' : '已移到未分组');
      } else {
        showToast(result.message ?? '移动失败');
      }
    },
    [moveTableToFolder, showToast],
  );

  // Template handlers
  const handleApplyTemplate = useCallback(
    (template: FieldTemplate) => {
      setRows((prevRows) => {
        const startOrder = prevRows.length;
        const newRows: typeof prevRows = template.fields.map(
          (field, index) => ({
            order: startOrder + index + 1,
            fieldName: field.fieldName,
            fieldComment: field.fieldComment || '',
            fieldType: field.fieldType,
            nullable: field.nullable,
            defaultKind: field.defaultKind || '无',
            defaultValue: field.defaultValue || '',
            onUpdate: field.onUpdate || '无',
          }),
        );
        return [...prevRows, ...newRows];
      });
      trackEvent('template_apply', { templateName: template.name });
      showToast(
        `已应用模板「${template.name}」，添加了 ${template.fields.length} 个字段`,
      );
    },
    [setRows, showToast, trackEvent],
  );

  const handleApplySuggestion = useCallback(
    (suggestion: StructuredSuggestion) => {
      if (suggestion.applied) return;

      let appliedCount = 0;
      let newIndexId: string | null = null;

      // Switch to appropriate tab based on suggestion type
      if (
        suggestion.type === 'add_index' ||
        suggestion.type === 'remove_index'
      ) {
        setActiveTab('indexes');
      } else if (
        suggestion.type === 'add_field' ||
        suggestion.type === 'modify_field' ||
        suggestion.type === 'remove_field'
      ) {
        setActiveTab('fields');
      }

      switch (suggestion.type) {
        case 'add_field':
          if (suggestion.field) {
            const newRow: FieldRow = {
              order: rows.length + 1,
              fieldName: suggestion.field.fieldName,
              fieldType: suggestion.field.fieldType,
              fieldComment: suggestion.field.fieldComment || '',
              nullable: suggestion.field.nullable || '是',
              defaultKind: suggestion.field.defaultKind || '无',
              defaultValue: suggestion.field.defaultValue || '',
              onUpdate: suggestion.field.onUpdate || '无',
            };
            setRows((prev) => [...prev, newRow]);
            appliedCount = 1;
            // Trigger field table highlight animation on the new row (last row)
            triggerFieldTableHighlight(rows.length);
          }
          break;

        case 'modify_field':
          if (suggestion.fieldModification) {
            const { fieldName } = suggestion.fieldModification;
            // Support both nested changes structure and flat structure from LLM
            const changes = suggestion.fieldModification.changes || {
              fieldType: (suggestion.fieldModification as any).fieldType,
              fieldComment: (suggestion.fieldModification as any).fieldComment,
              nullable: (suggestion.fieldModification as any).nullable,
              defaultKind: (suggestion.fieldModification as any).defaultKind,
              defaultValue: (suggestion.fieldModification as any).defaultValue,
              onUpdate: (suggestion.fieldModification as any).onUpdate,
            };
            const rowIndex = rows.findIndex((r) => r.fieldName === fieldName);
            if (rowIndex !== -1) {
              // Filter out undefined values to avoid overwriting with undefined
              const filteredChanges = Object.fromEntries(
                Object.entries(changes).filter(([, v]) => v !== undefined),
              );
              setRows((prev) => {
                const updatedRows = [...prev];
                updatedRows[rowIndex] = {
                  ...updatedRows[rowIndex],
                  ...filteredChanges,
                };
                return updatedRows;
              });
              appliedCount = 1;
              // Trigger field table highlight animation on the modified row
              triggerFieldTableHighlight(rowIndex);
            }
          }
          break;

        case 'remove_field':
          if (suggestion.fieldName) {
            const rowIndex = rows.findIndex(
              (r) => r.fieldName === suggestion.fieldName,
            );
            if (rowIndex !== -1) {
              // Trigger row highlight first
              triggerFieldTableHighlight(rowIndex);

              // Delay actual removal
              setTimeout(() => {
                setRows((prev) => {
                  const newRows = prev.filter(
                    (r) => r.fieldName !== suggestion.fieldName,
                  );
                  // 重新排序
                  return newRows.map((r, i) => ({
                    ...r,
                    order: i + 1,
                  }));
                });
              }, 500);

              appliedCount = 1;
            }
          }
          break;

        case 'add_index':
          if (suggestion.index) {
            newIndexId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
            const newIndex: IndexDefinition = {
              id: newIndexId,
              name: suggestion.index.name,
              fields: suggestion.index.fields,
              unique: !!suggestion.index.unique,
            };
            setIndexes((prev) => [...prev, newIndex]);
            appliedCount = 1;
            // Trigger add animation after a small delay to ensure DOM is updated
            setTimeout(() => {
              if (newIndexId) {
                triggerIndexAnimation(newIndexId, 'add');
              }
            }, 50);
          }
          break;

        case 'remove_index':
          if (suggestion.indexName) {
            const targetIndex = indexes.find(
              (idx) => idx.name === suggestion.indexName,
            );
            if (targetIndex) {
              // Trigger remove animation first
              triggerIndexAnimation(targetIndex.id, 'remove');
              // Delay actual removal until animation completes
              setTimeout(() => {
                setIndexes((prev) =>
                  prev.filter((idx) => idx.name !== suggestion.indexName),
                );
              }, 500);
              appliedCount = 1;
            }
          }
          break;

        default:
          break;
      }

      if (appliedCount > 0 && reviewResult) {
        // 更新评审结果，标记该建议已应用
        const newSuggestions = reviewResult.suggestions.map((s) => {
          if (typeof s !== 'string' && s.id === suggestion.id) {
            return { ...s, applied: true };
          }
          return s;
        });
        setReviewResult({ ...reviewResult, suggestions: newSuggestions });
        trackEvent('sql_suggestion_apply', {
          type: suggestion.type,
          description: suggestion.description,
        });
        showToast(`已应用建议：${suggestion.description}`);
      }
    },
    [
      rows,
      indexes,
      reviewResult,
      setRows,
      setIndexes,
      setReviewResult,
      showToast,
      trackEvent,
      triggerIndexAnimation,
      triggerFieldTableHighlight,
    ],
  );

  const handleCreateTemplateFromFields = useCallback(
    async (
      name: string,
      fields: Array<{
        fieldName?: string;
        fieldType?: string;
        fieldComment?: string;
        nullable?: string;
        defaultKind?: string;
        defaultValue?: string;
        onUpdate?: string;
      }>,
      description?: string,
    ) => {
      const result = await createTemplateFromFields(name, fields, description);
      if (result.ok) {
        trackEvent('template_create', { templateName: name });
        showToast(`已创建模板「${name}」`);
      } else {
        showToast(result.message ?? '创建失败');
      }
      return result;
    },
    [createTemplateFromFields, showToast, trackEvent],
  );

  const handleSaveAsTemplate = useCallback(() => {
    // 过滤掉完全为空的行
    const validRows = rows.filter((r) => r.fieldName.trim());
    if (validRows.length === 0) {
      showToast('当前表中没有有效字段可保存');
      return;
    }
    setSelectedFieldsForTemplate(validRows);
    setIsCreateTemplateDialogOpen(true);
  }, [rows, showToast]);

  const handleImport = useCallback(
    (result: ParsedResult, importDbType: DatabaseType) => {
      // 1. Basic Info
      setTableName(result.tableName);
      setTableComment(result.tableComment);
      setDbType(importDbType);

      // 2. Fields
      const newRows: FieldRow[] = result.fields.map((field, index) => {
        let uiNullable = '是';
        if (field.nullable === false) uiNullable = '否';

        let uiDefaultKind = '无';
        switch (field.defaultKind) {
          case 'auto_increment':
            uiDefaultKind = '自增';
            break;
          case 'constant':
            uiDefaultKind = '常量';
            break;
          case 'current_timestamp':
            uiDefaultKind = '当前时间';
            break;
          case 'uuid':
            uiDefaultKind = 'uuid';
            break;
        }

        let uiOnUpdate = '无';
        if (field.onUpdate === 'current_timestamp') uiOnUpdate = '当前时间';

        return {
          order: index + 1,
          fieldName: field.name,
          fieldType: field.type,
          fieldComment: field.comment,
          nullable: uiNullable,
          defaultKind: uiDefaultKind,
          defaultValue: field.defaultValue,
          onUpdate: uiOnUpdate,
        };
      });

      // Pad with empty rows if needed
      const minRows = 12;
      if (newRows.length < minRows) {
        for (let i = newRows.length; i < minRows; i++) {
          newRows.push(createEmptyRow(i));
        }
      }
      setRows(newRows);

      // 3. Indexes
      setIndexes(result.indexes);
      setIndexInput('');

      // 4. Auth
      setAuthObjects(result.authObjects);
      setAuthInput('');
      trackEvent('sql_import', { dbType: importDbType });
    },
    [
      setRows,
      setIndexes,
      setAuthObjects,
      setIndexInput,
      setAuthInput,
      trackEvent,
    ],
  );

  const handleOpenSaveDialog = useCallback(() => {
    openSaveDialog(null);
  }, [openSaveDialog]);

  const handleOpenSavedTablesDrawer = useCallback(() => {
    trackEvent('sidebar_open');
    setSavedTablesDrawerOpen(true);
  }, [trackEvent]);

  const handleOpenDiffDialog = useCallback(() => {
    trackEvent('diff_view_open');
    setIsDiffDialogOpen(true);
  }, [trackEvent]);

  const handleTabValueChange = useCallback(
    (value: string) => {
      setActiveTab(value);
      trackEvent('tab_switch', { tab: value });
    },
    [trackEvent],
  );

  const handleOpenStorageEstimator = useCallback(() => {
    trackEvent('storage_estimator_open');
    setIsStorageEstimatorOpen(true);
  }, [trackEvent]);

  const handleManageTemplates = useCallback(() => {
    setIsTemplateManagerOpen(true);
  }, []);

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

      <SavedTablesDrawer
        open={savedTablesDrawerOpen}
        onOpenChange={setSavedTablesDrawerOpen}
        loading={savedTablesLoading}
        error={savedTablesError}
        items={savedTables}
        folders={folderTree}
        foldersLoading={foldersLoading}
        activeNormalizedName={loadedTableNormalizedName}
        activeDirty={isLoadedDirty}
        onSelect={handleSelectSavedTable}
        onRename={handleOpenRenameDialog}
        onDelete={handleOpenDeleteDialog}
        onViewHistory={(item) => {
          setVersionHistoryTarget({
            normalizedName: item.normalizedName,
            name: item.name,
          });
          setIsVersionHistoryOpen(true);
        }}
        onMoveToFolder={handleMoveTableToFolder}
        onCreateFolder={handleOpenCreateFolderDialog}
        onRenameFolder={handleOpenRenameFolderDialog}
        onDeleteFolder={handleOpenDeleteFolderDialog}
      />

      <FolderDialog
        open={isFolderDialogOpen}
        onOpenChange={setIsFolderDialogOpen}
        mode={folderDialogMode}
        parentFolder={folderDialogParent}
        targetFolder={folderDialogTarget}
        onConfirm={handleFolderDialogConfirm}
      />

      <DeleteFolderDialog
        open={isDeleteFolderDialogOpen}
        onOpenChange={setIsDeleteFolderDialogOpen}
        folder={deleteFolderTarget}
        tableCount={deleteFolderTableCount}
        onConfirm={handleDeleteFolderConfirm}
      />

      <TemplateManagerDialog
        open={isTemplateManagerOpen}
        onOpenChange={setIsTemplateManagerOpen}
        templates={templates}
        loading={templatesLoading}
        onCreateTemplate={createTemplate}
        onUpdateTemplate={updateTemplate}
        onDuplicateTemplate={duplicateTemplate}
        onDeleteTemplate={deleteTemplate}
      />

      <CreateTemplateDialog
        open={isCreateTemplateDialogOpen}
        onOpenChange={setIsCreateTemplateDialogOpen}
        selectedFields={selectedFieldsForTemplate}
        onConfirm={handleCreateTemplateFromFields}
      />

      <DiffDialog
        open={isDiffDialogOpen}
        onOpenChange={setIsDiffDialogOpen}
        tableName={tableName}
        dbType={dbType}
        diff={tableDiff}
        fields={normalizedFields}
        onCopy={() => showToast('变更脚本已复制')}
      />

      <VersionHistoryDialog
        open={isVersionHistoryOpen}
        onOpenChange={setIsVersionHistoryOpen}
        tableNormalizedName={versionHistoryTarget?.normalizedName ?? null}
        tableName={versionHistoryTarget?.name ?? null}
        currentState={currentPersistedState}
        onRollback={(state) => {
          applySavedState(state);
          trackEvent('table_version_rollback');
          showToast('已回滚到选中版本');
        }}
      />

      <ReviewHistoryDialog
        open={isReviewHistoryOpen}
        onOpenChange={setIsReviewHistoryOpen}
        tableNormalizedName={loadedTableNormalizedName}
      />

      {/* Main Content */}
      <div className="flex flex-col gap-4 p-4">
        <div className="flex flex-col gap-4 lg:flex-row">
          <div className="flex flex-1 flex-col gap-4">
            <TableConfig
              tableName={tableName}
              tableComment={tableComment}
              dbType={dbType}
              onTableNameChange={setTableName}
              onTableCommentChange={setTableComment}
              onDbTypeChange={setDbType}
              onClearAll={handleClearAll}
              onSaveTable={handleOpenSaveDialog}
              onOpenSavedTables={handleOpenSavedTablesDrawer}
              onViewDiff={handleOpenDiffDialog}
              saveDisabled={!canSaveCurrent}
              saveDisabledHint="加载的表未修改，无法保存"
              showDiffButton={isLoadedDirty && tableDiff?.hasChanges}
              loadedStatus={loadedStatus}
              loadedTableName={loadedTableName}
            />

            <Tabs
              value={activeTab}
              onValueChange={handleTabValueChange}
              className="w-full"
            >
              <TabsList className={`grid w-full ${tabGridClass}`}>
                <TabsTrigger value="fields" className="gap-2">
                  <Columns3Cog className="h-4 w-4" />
                  字段配置
                  {filledRowCount > 0 && (
                    <span className="ml-1 inline-flex items-center justify-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      {filledRowCount}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="indexes" className="gap-2">
                  <Network className="h-4 w-4" />
                  索引配置
                  {indexes.length > 0 && (
                    <div className="ml-2 flex items-center gap-2">
                      {indexStats.primary > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded">
                          <Key className="h-3 w-3" />
                          {indexStats.primary}
                        </span>
                      )}
                      {indexStats.unique > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded">
                          <Lock className="h-3 w-3" />
                          {indexStats.unique}
                        </span>
                      )}
                      {indexStats.normal > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded">
                          <Hash className="h-3 w-3" />
                          {indexStats.normal}
                        </span>
                      )}
                    </div>
                  )}
                </TabsTrigger>
                <TabsTrigger value="auth" className="gap-2">
                  <ShieldUser className="h-4 w-4" />
                  授权配置
                  {authObjects.length > 0 && (
                    <span className="ml-1 inline-flex items-center justify-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      {authObjects.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="misc" className="gap-2">
                  <SlidersHorizontal className="h-4 w-4" />
                  杂项设置
                  {tableMiscConfig.enabled && (
                    <span className="ml-1 inline-flex items-center justify-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      已启用
                    </span>
                  )}
                </TabsTrigger>
                {dbType === 'postgresql-citus' && (
                  <TabsTrigger value="sharding" className="gap-2">
                    <Share2 className="h-4 w-4" />
                    分片配置
                    {citusShardingConfig.mode === 'distributed' &&
                      citusShardingConfig.distributionColumn && (
                        <span className="ml-1 inline-flex items-center justify-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          {citusShardingConfig.distributionColumn}
                        </span>
                      )}
                  </TabsTrigger>
                )}
                {supportsMysqlPartition && (
                  <TabsTrigger value="partition" className="gap-2">
                    <Layers className="h-4 w-4" />
                    分区配置
                    {mysqlPartitionConfig.enabled && (
                      <span className="ml-1 inline-flex items-center justify-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        {mysqlPartitionConfig.type}
                      </span>
                    )}
                  </TabsTrigger>
                )}
              </TabsList>
              <TabsContent value="fields" className="mt-4">
                <DataTable
                  rows={rows}
                  duplicateNameSet={duplicateNameSet}
                  dbType={dbType}
                  addCount={addCount}
                  onRowsChange={handleRowsChange as any}
                  onCreateRow={handleCreateRow}
                  onRemoveRow={handleRemoveRow}
                  onAddRows={handleAddRows}
                  onAddCountChange={setAddCount}
                  isHighlighted={isFieldTableHighlighted}
                  highlightedRowIndex={highlightedRowIndex}
                  onOpenStorageEstimator={handleOpenStorageEstimator}
                  toolbarLeft={dataTableToolbarLeft}
                />
              </TabsContent>
              <TabsContent value="indexes" className="mt-4">
                <IndexPanel
                  indexInput={indexInput}
                  currentIndexFields={currentIndexFields}
                  indexes={indexes}
                  fieldSuggestions={fieldSuggestions}
                  showFieldSuggestions={showFieldSuggestions}
                  selectedSuggestionIndex={selectedSuggestionIndex}
                  onIndexInputChange={setIndexInput}
                  onSetShowFieldSuggestions={setShowFieldSuggestions}
                  onSetSelectedSuggestionIndex={setSelectedSuggestionIndex}
                  onAddFieldToIndex={addFieldToIndex}
                  onRemoveFieldFromIndex={removeFieldFromIndex}
                  onToggleFieldDirection={toggleFieldDirection}
                  onAddIndex={(unique, primary) => addIndex(!!unique, primary)}
                  onRemoveIndex={removeIndex}
                  onUpdateIndexName={updateIndexName}
                  animatingIndexIds={animatingIndexIds}
                  removingIndexIds={removingIndexIds}
                />
              </TabsContent>
              <TabsContent value="auth" className="mt-4">
                <AuthPanel
                  authInput={authInput}
                  authObjects={authObjects}
                  onAuthInputChange={setAuthInput}
                  onAddAuthObject={addAuthObject}
                  onRemoveAuthObject={removeAuthObject}
                />
              </TabsContent>
              <TabsContent value="misc" className="mt-4">
                <TableOptionsPanel
                  dbType={dbType}
                  config={tableMiscConfig}
                  onEnabledChange={setMiscEnabled}
                  onEngineChange={setEngine}
                  onCharsetChange={setCharset}
                  onCollationChange={setCollation}
                  onTablespaceChange={setTablespace}
                />
              </TabsContent>
              {dbType === 'postgresql-citus' && (
                <TabsContent value="sharding" className="mt-4">
                  <ShardingPanel
                    config={citusShardingConfig}
                    availableFields={availableFields}
                    onModeChange={setCitusMode}
                    onDistributionColumnChange={setDistributionColumn}
                  />
                </TabsContent>
              )}
              {supportsMysqlPartition && (
                <TabsContent value="partition" className="mt-4">
                  <PartitionPanel
                    config={mysqlPartitionConfig}
                    availableFields={availableFields}
                    onEnabledChange={setPartitionEnabled}
                    onTypeChange={setPartitionType}
                    onColumnsChange={setPartitionColumns}
                    onExpressionChange={setPartitionExpression}
                    onPartitionCountChange={setPartitionCount}
                    onAddPartition={addPartition}
                    onRemovePartition={removePartition}
                    onUpdatePartition={updatePartition}
                    onGeneratePartitions={generateRangePartitions}
                  />
                </TabsContent>
              )}
            </Tabs>
          </div>

          <DDLOutput
            generatedSql={generatedSql}
            generatedDcl={generatedDcl}
            dbType={dbType}
            onCopySql={copySql}
            onCopyDcl={copyDcl}
            isReviewing={isReviewing}
            reviewPartialResult={reviewPartialResult}
            reviewResult={reviewResult}
            reviewError={reviewError}
            onStartReview={handleStartReview}
            onViewReviewHistory={handleViewReviewHistory}
            onApplySuggestion={handleApplySuggestion}
          />
        </div>
      </div>

      <Dialog open={isClearDialogOpen} onOpenChange={setIsClearDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>确认清空所有配置？</DialogTitle>
            <DialogDescription>
              此操作将移除当前填写的表信息、字段、索引及授权配置，且无法撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={cancelClearAll}>
              取消
            </Button>
            <Button variant="destructive" onClick={confirmClearAll}>
              确认清空
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isSaveDialogOpen} onOpenChange={handleSaveDialogOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{saveDialogTitle}</DialogTitle>
            <DialogDescription>{saveDialogDescription}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="save-table-name">保存名称</Label>
            <Input
              id="save-table-name"
              value={saveName}
              onChange={(event) => {
                setSaveName(event.target.value);
                if (saveError) setSaveError('');
              }}
              placeholder="例如：用户表"
              disabled={saveInputDisabled}
            />
            {saveInputDisabled && (
              <p className="text-xs text-muted-foreground">
                已加载表仅支持覆盖保存，如需更名请在左侧列表重命名。
              </p>
            )}
            {saveError && (
              <p className="text-xs text-destructive">{saveError}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => handleSaveDialogOpenChange(false)}
            >
              取消
            </Button>
            <Button onClick={handleConfirmSave} disabled={!canSaveCurrent}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isLoadConfirmOpen}
        onOpenChange={handleLoadConfirmOpenChange}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>加载保存的表</DialogTitle>
            <DialogDescription>
              {pendingLoadTarget
                ? `加载「${pendingLoadTarget.name}」将覆盖当前内容。`
                : '加载将覆盖当前内容。'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pr-2">
            <Button variant="outline" onClick={handleCancelLoadConfirm}>
              取消
            </Button>
            <Button
              variant="secondary"
              onClick={handleConfirmLoadSave}
              disabled={!canSaveCurrent}
              title={!canSaveCurrent ? '加载的表未修改，无法保存' : undefined}
            >
              保存当前后加载
            </Button>
            <Button variant="destructive" onClick={handleConfirmLoadIgnore}>
              忽略当前并加载
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isRenameDialogOpen}
        onOpenChange={handleRenameDialogOpenChange}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>重命名保存的表</DialogTitle>
            <DialogDescription>
              请输入新的名称，名称不可重复。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="rename-table-name">新名称</Label>
            <Input
              id="rename-table-name"
              value={renameName}
              onChange={(event) => {
                setRenameName(event.target.value);
                if (renameError) setRenameError('');
              }}
              placeholder="例如：订单表"
            />
            {renameError && (
              <p className="text-xs text-destructive">{renameError}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => handleRenameDialogOpenChange(false)}
            >
              取消
            </Button>
            <Button onClick={handleConfirmRename}>确认</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isDeleteDialogOpen}
        onOpenChange={handleDeleteDialogOpenChange}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>确认删除保存的表？</DialogTitle>
            <DialogDescription>
              {deleteTarget
                ? `即将删除「${deleteTarget.name}」，此操作无法撤销。`
                : '此操作无法撤销。'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => handleDeleteDialogOpenChange(false)}
            >
              取消
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-6 left-1/2 z-50 -translate-x-1/2 transform rounded-full bg-foreground/90 px-5 py-2.5 text-sm font-medium text-background shadow-xl transition-[opacity,transform] duration-300 animate-in fade-in zoom-in-95 slide-in-from-top-4 motion-reduce:animate-none motion-reduce:transition-none">
          {toastMessage}
        </div>
      )}

      <StorageEstimatorDialog
        open={isStorageEstimatorOpen}
        onOpenChange={setIsStorageEstimatorOpen}
        dbType={dbType}
        fields={normalizedFields}
      />
    </div>
  );
}

export default App;
