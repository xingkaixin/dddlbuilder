import type { PersistedState } from '@ddlbuilder/shared-types';
import type { SavedTableDraftRecord, WorkspaceSource } from '@ddlbuilder/shared-types/workspace';
import type { SaveTableResult, SavedTableSummary } from '@/hooks/useSavedTables';
import type { UseDialogStateReturn } from '@/hooks/useDialogState';
import { useRenameDeleteActions } from './savedTableFlow/renameDeleteActions';
import { useSaveLoadActions } from './savedTableFlow/saveLoadActions';

type AnalyticsValue = string | number | boolean | null | undefined;

type SaveDialogData = {
  name: string;
  queuedLoadAfterSave: SavedTableSummary | null;
};

type RenameDialogData = {
  name: string;
  target: SavedTableSummary | null;
};

type DeleteDialogData = {
  target: SavedTableSummary | null;
};

interface UseSavedTableFlowActionsParams {
  tableName: string;
  hasLoadedTable: boolean;
  canSaveCurrent: boolean;
  loadedTableNormalizedName: string | null;
  loadedTableName: string | null;
  loadedTableSignature: string | null;
  setLoadedTableNormalizedName: (value: string | null) => void;
  setLoadedTableName: (value: string | null) => void;
  setLoadedTableSignature: (value: string | null) => void;
  setLoadedTableVersion: (version: number) => void;
  setSavedTablesDrawerOpen: (open: boolean) => void;
  saveDialog: UseDialogStateReturn<SaveDialogData>;
  renameDialog: UseDialogStateReturn<RenameDialogData>;
  deleteDialog: UseDialogStateReturn<DeleteDialogData>;
  buildPersistedState: () => PersistedState;
  serializePersistedState: (state: PersistedState) => string;
  applySavedState: (state: PersistedState) => void;
  loadTable: (normalizedName: string) => Promise<{
    normalizedName: string;
    name: string;
    state: PersistedState;
  } | null>;
  renameTable: (normalizedName: string, newName: string) => Promise<SaveTableResult>;
  deleteTable: (normalizedName: string) => Promise<SaveTableResult>;
  saveTable: (name: string, state: PersistedState) => Promise<SaveTableResult>;
  overwriteTable: (normalizedName: string, state: PersistedState) => Promise<SaveTableResult>;
  showToast: (message: string) => void;
  trackEvent: (event: string, data?: Record<string, AnalyticsValue>) => Promise<void> | void;
  flushCurrentWorkspace?: () => void;
  getSavedTableDraft?: (normalizedName: string) => SavedTableDraftRecord | null;
  setWorkspaceSnapshot?: (source: WorkspaceSource, state: PersistedState) => void;
  renameSavedTableDraft?: (
    fromNormalizedName: string,
    toNormalizedName: string,
    nextTableName: string,
  ) => void;
  removeSavedTableDraft?: (normalizedName: string) => void;
  onSaveSuccess?: (payload: {
    normalizedName: string;
    displayName: string;
    baseSignature: string;
    mode: 'create' | 'update';
  }) => Promise<void> | void;
  onTableLoadStateChange?: (loading: boolean) => void;
  onTabRename?: (fromNormalizedName: string, toNormalizedName: string, newTitle: string) => void;
  onTabRemove?: (normalizedName: string) => void;
}

export function useSavedTableFlowActions({
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
  onSaveSuccess,
  onTableLoadStateChange,
  onTabRename,
  onTabRemove,
}: UseSavedTableFlowActionsParams) {
  const saveLoadActions = useSaveLoadActions({
    tableName,
    hasLoadedTable,
    canSaveCurrent,
    loadedTableNormalizedName,
    loadedTableName,
    setLoadedTableNormalizedName,
    setLoadedTableName,
    setLoadedTableSignature,
    setLoadedTableVersion,
    setSavedTablesDrawerOpen,
    saveDialog,
    buildPersistedState,
    serializePersistedState,
    applySavedState,
    loadTable,
    saveTable,
    overwriteTable,
    showToast,
    trackEvent,
    flushCurrentWorkspace,
    getSavedTableDraft,
    setWorkspaceSnapshot,
    onSaveSuccess,
    onTableLoadStateChange,
  });

  const renameDeleteActions = useRenameDeleteActions({
    loadedTableNormalizedName,
    loadedTableSignature,
    setLoadedTableNormalizedName,
    setLoadedTableName,
    setLoadedTableSignature,
    renameDialog,
    deleteDialog,
    buildPersistedState,
    serializePersistedState,
    renameTable,
    deleteTable,
    showToast,
    trackEvent,
    setWorkspaceSnapshot,
    renameSavedTableDraft,
    removeSavedTableDraft,
    onTabRename,
    onTabRemove,
  });

  return {
    ...saveLoadActions,
    ...renameDeleteActions,
  };
}
