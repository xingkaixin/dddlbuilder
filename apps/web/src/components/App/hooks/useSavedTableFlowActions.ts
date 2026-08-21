import type { PersistedState } from '@ddlbuilder/shared-types';
import type { SavedTableDraftRecord, WorkspaceSource } from '@ddlbuilder/shared-types/workspace';
import type { SaveTableResult, SavedTableSummary } from '@/hooks/useSavedTables';
import type { UseDialogStateReturn } from '@/hooks/useDialogState';
import { useRenameDeleteActions } from './savedTableFlow/renameDeleteActions';
import { useSaveLoadActions } from './savedTableFlow/saveLoadActions';

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
  loadedTableSource: Extract<WorkspaceSource, { kind: 'saved_table' }> | null;
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
  onSaveSuccess,
  onTableLoadStateChange,
  onTabRename,
  onTabRemove,
}: UseSavedTableFlowActionsParams) {
  const saveLoadActions = useSaveLoadActions({
    tableName,
    hasLoadedTable,
    canSaveCurrent,
    loadedTableSource,
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
    flushCurrentWorkspace,
    getSavedTableDraft,
    setWorkspaceSnapshot,
    onSaveSuccess,
    onTableLoadStateChange,
  });

  const renameDeleteActions = useRenameDeleteActions({
    loadedTableSource,
    renameDialog,
    deleteDialog,
    buildPersistedState,
    serializePersistedState,
    renameTable,
    deleteTable,
    showToast,
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
