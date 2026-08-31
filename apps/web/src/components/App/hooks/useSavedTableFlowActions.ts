import { type SavedTableTarget } from '@ddlbuilder/shared-types/workspace';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { SavedTableDraftRecord, WorkspaceSelection } from '@ddlbuilder/shared-types/workspace';
import type { SaveTableResult, SavedTableSummary } from '@/hooks/useSavedTables';
import type { UseDialogStateReturn } from '@/hooks/useDialogState';
import { useRenameDeleteActions } from './savedTableFlow/renameDeleteActions';
import { useSaveLoadActions } from './savedTableFlow/saveLoadActions';

type SaveDialogData = {
  name: string;
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
  loadedTableSource: Extract<WorkspaceSelection, { kind: 'saved_table' }> | null;
  sourceDraftId?: string;
  setLoadedTableVersion: (version: number, normalizedName?: SavedTableTarget) => void;
  saveDialog: UseDialogStateReturn<SaveDialogData>;
  renameDialog: UseDialogStateReturn<RenameDialogData>;
  deleteDialog: UseDialogStateReturn<DeleteDialogData>;
  buildPersistedState: () => PersistedState;
  loadTable: (normalizedName: SavedTableTarget) => Promise<{
    tableId?: string;
    normalizedName: string;
    name: string;
    state: PersistedState;
  } | null>;
  renameTable: (normalizedName: SavedTableTarget, newName: string) => Promise<SaveTableResult>;
  deleteTable: (normalizedName: SavedTableTarget) => Promise<SaveTableResult>;
  saveTable: (name: string, state: PersistedState, draftId?: string) => Promise<SaveTableResult>;
  overwriteTable: (
    normalizedName: SavedTableTarget,
    state: PersistedState,
  ) => Promise<SaveTableResult>;
  countTableVersions: (normalizedName: SavedTableTarget) => Promise<number>;
  createTableVersion: (
    normalizedName: SavedTableTarget,
    state: PersistedState,
    message?: string,
  ) => Promise<unknown>;
  showToast: (message: string) => void;
  getSavedTableDraft?: (normalizedName: SavedTableTarget) => SavedTableDraftRecord | null;
  renameSavedTableDraft?: (
    fromNormalizedName: SavedTableTarget,
    toNormalizedName: string,
    nextTableName: string,
  ) => void;
  removeSavedTableDraft?: (normalizedName: SavedTableTarget) => void;
  onSaveSuccess?: (payload: {
    normalizedName: string;
    displayName: string;
    baseSignature: string;
    baseState: PersistedState;
    mode: 'create' | 'update';
  }) => Promise<void> | void;
  onTableLoadStateChange?: (loading: boolean) => void;
  onTabRename?: (
    fromNormalizedName: SavedTableTarget,
    toNormalizedName: string,
    newTitle: string,
  ) => void;
  onTabRemove?: (normalizedName: SavedTableTarget) => void;
}

export function useSavedTableFlowActions({
  tableName,
  hasLoadedTable,
  canSaveCurrent,
  loadedTableSource,
  sourceDraftId,
  setLoadedTableVersion,
  saveDialog,
  renameDialog,
  deleteDialog,
  buildPersistedState,
  loadTable,
  renameTable,
  deleteTable,
  saveTable,
  overwriteTable,
  countTableVersions,
  createTableVersion,
  showToast,
  getSavedTableDraft,
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
    sourceDraftId,
    setLoadedTableVersion,
    saveDialog,
    buildPersistedState,
    loadTable,
    saveTable,
    overwriteTable,
    countTableVersions,
    createTableVersion,
    showToast,
    getSavedTableDraft,
    onSaveSuccess,
    onTableLoadStateChange,
  });

  const renameDeleteActions = useRenameDeleteActions({
    renameDialog,
    deleteDialog,
    renameTable,
    deleteTable,
    showToast,
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
