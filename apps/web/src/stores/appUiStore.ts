import { create } from 'zustand';
import { isCnyFireworksEnabled } from '@/config/featureFlags';

const cnyFireworksShownKey = 'ddlbuilder:fireworks:cny:shown:2026:v1';

function readCnyFireworksPending(): boolean {
  if (!isCnyFireworksEnabled) return false;

  try {
    return !localStorage.getItem(cnyFireworksShownKey);
  } catch {
    return false;
  }
}

export function markCnyFireworksShown() {
  localStorage.setItem(cnyFireworksShownKey, 'true');
}

export interface VersionHistoryTarget {
  tableId: string;
  normalizedName: string;
  name: string;
}

type SimpleDialogKind =
  | 'user-settings'
  | 'import'
  | 'er'
  | 'ai-schema-patch'
  | 'save'
  | 'rename'
  | 'delete'
  | 'clear'
  | 'diff'
  | 'review-history'
  | 'storage-estimator'
  | 'ai-generate'
  | 'mock-data';

export type ActiveAppDialog =
  | { kind: 'none' }
  | { kind: SimpleDialogKind }
  | { kind: 'version-history'; target: VersionHistoryTarget }
  | { kind: 'timeline-player'; target: VersionHistoryTarget };

interface AppUiState {
  workspaceSidebarOpen: boolean;
  savedTablesDrawerOpen: boolean;
  activeDialog: ActiveAppDialog;
  showFireworks: boolean;
  activeFieldId: string | null;
  setActiveFieldId: (id: string | null) => void;
  setWorkspaceSidebarOpen: (open: boolean) => void;
  setSavedTablesDrawerOpen: (open: boolean) => void;
  setIsImportDialogOpen: (open: boolean) => void;
  setIsUserSettingsOpen: (open: boolean) => void;
  setIsErDialogOpen: (open: boolean) => void;
  setIsAISchemaPatchOpen: (open: boolean) => void;
  setIsSaveDialogOpen: (open: boolean) => void;
  setIsRenameDialogOpen: (open: boolean) => void;
  setIsDeleteDialogOpen: (open: boolean) => void;
  setIsClearDialogOpen: (open: boolean) => void;
  setShowFireworks: (show: boolean) => void;
  setIsDiffDialogOpen: (open: boolean) => void;
  setVersionHistoryTarget: (target: VersionHistoryTarget | null) => void;
  setTimelinePlayerTarget: (target: VersionHistoryTarget | null) => void;
  setIsReviewHistoryOpen: (open: boolean) => void;
  setIsStorageEstimatorOpen: (open: boolean) => void;
  setIsAIGenerateDialogOpen: (open: boolean) => void;
  setIsMockDataDialogOpen: (open: boolean) => void;
}

const noDialog: ActiveAppDialog = { kind: 'none' };

const closeDialog = (activeDialog: ActiveAppDialog, kind: ActiveAppDialog['kind']) =>
  activeDialog.kind === kind ? noDialog : activeDialog;

export const useAppUiStore = create<AppUiState>((set) => {
  const setDialogOpen = (kind: SimpleDialogKind) => (open: boolean) =>
    set((state) => ({
      activeDialog: open ? { kind } : closeDialog(state.activeDialog, kind),
    }));

  return {
    workspaceSidebarOpen:
      typeof window === 'undefined' ||
      !window.matchMedia ||
      window.matchMedia('(min-width: 640px)').matches,
    savedTablesDrawerOpen: false,
    activeDialog: noDialog,
    showFireworks: readCnyFireworksPending(),
    activeFieldId: null,
    setActiveFieldId: (activeFieldId) => set({ activeFieldId }),
    setWorkspaceSidebarOpen: (workspaceSidebarOpen) => set({ workspaceSidebarOpen }),
    setSavedTablesDrawerOpen: (savedTablesDrawerOpen) => set({ savedTablesDrawerOpen }),
    setIsImportDialogOpen: setDialogOpen('import'),
    setIsUserSettingsOpen: setDialogOpen('user-settings'),
    setIsErDialogOpen: setDialogOpen('er'),
    setIsAISchemaPatchOpen: setDialogOpen('ai-schema-patch'),
    setIsSaveDialogOpen: setDialogOpen('save'),
    setIsRenameDialogOpen: setDialogOpen('rename'),
    setIsDeleteDialogOpen: setDialogOpen('delete'),
    setIsClearDialogOpen: setDialogOpen('clear'),
    setShowFireworks: (showFireworks) => set({ showFireworks }),
    setIsDiffDialogOpen: setDialogOpen('diff'),
    setVersionHistoryTarget: (target) =>
      set((state) => ({
        activeDialog: target
          ? { kind: 'version-history', target }
          : closeDialog(state.activeDialog, 'version-history'),
      })),
    setTimelinePlayerTarget: (target) =>
      set((state) => ({
        activeDialog: target
          ? { kind: 'timeline-player', target }
          : closeDialog(state.activeDialog, 'timeline-player'),
      })),
    setIsReviewHistoryOpen: setDialogOpen('review-history'),
    setIsStorageEstimatorOpen: setDialogOpen('storage-estimator'),
    setIsAIGenerateDialogOpen: setDialogOpen('ai-generate'),
    setIsMockDataDialogOpen: setDialogOpen('mock-data'),
  };
});
