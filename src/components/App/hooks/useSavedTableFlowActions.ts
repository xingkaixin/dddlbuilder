import type { PersistedState } from '@/types';
import type { SavedTableDraftRecord, WorkspaceSource } from '@/types/workspace';
import type {
  SaveTableResult,
  SavedTableSummary,
} from '@/hooks/useSavedTables';
import type { UseDialogStateReturn } from '@/hooks/useDialogState';
import { useRenameDeleteActions } from './savedTableFlow/renameDeleteActions';
import { useSaveLoadActions } from './savedTableFlow/saveLoadActions';

type AnalyticsValue = string | number | boolean | null | undefined;

type SaveDialogData = {
  name: string;
  queuedLoadAfterSave: SavedTableSummary | null;
};

type LoadConfirmDialogData = {
  pendingTarget: SavedTableSummary | null;
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
  isLoadedDirty: boolean;
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
  loadConfirmDialog: UseDialogStateReturn<LoadConfirmDialogData>;
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
  renameTable: (
    normalizedName: string,
    newName: string,
  ) => Promise<SaveTableResult>;
  deleteTable: (normalizedName: string) => Promise<SaveTableResult>;
  saveTable: (name: string, state: PersistedState) => Promise<SaveTableResult>;
  overwriteTable: (
    normalizedName: string,
    state: PersistedState,
  ) => Promise<SaveTableResult>;
  showToast: (message: string) => void;
  trackEvent: (
    event: string,
    data?: Record<string, AnalyticsValue>,
  ) => Promise<void> | void;
  flushCurrentWorkspace?: () => void;
  getSavedTableDraft?: (normalizedName: string) => SavedTableDraftRecord | null;
  setWorkspaceSnapshot?: (
    source: WorkspaceSource,
    state: PersistedState | null,
  ) => void;
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
}

export function useSavedTableFlowActions({
  tableName,
  hasLoadedTable,
  isLoadedDirty,
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
  flushCurrentWorkspace,
  getSavedTableDraft: _getSavedTableDraft,
  setWorkspaceSnapshot,
  renameSavedTableDraft,
  removeSavedTableDraft,
  onSaveSuccess,
}: UseSavedTableFlowActionsParams) {
  const saveLoadActions = useSaveLoadActions({
    tableName,
    hasLoadedTable,
    isLoadedDirty,
    canSaveCurrent,
    loadedTableNormalizedName,
    loadedTableName,
    setLoadedTableNormalizedName,
    setLoadedTableName,
    setLoadedTableSignature,
    setLoadedTableVersion,
    setSavedTablesDrawerOpen,
    saveDialog,
    loadConfirmDialog,
    buildPersistedState,
    serializePersistedState,
    applySavedState,
    loadTable,
    saveTable,
    overwriteTable,
    showToast,
    trackEvent,
    flushCurrentWorkspace,
    setWorkspaceSnapshot,
    onSaveSuccess,
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
  });

  return {
    ...saveLoadActions,
    ...renameDeleteActions,
  };
}
