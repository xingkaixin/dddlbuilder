import { create } from 'zustand';

type CoreDialogState = Record<'save' | 'rename' | 'delete', boolean>;

export interface VersionHistoryTarget {
  normalizedName: string;
  name: string;
}

interface AppUiState {
  workspaceSidebarOpen: boolean;
  outputPanelOpen: boolean;
  savedTablesDrawerOpen: boolean;
  dialogs: CoreDialogState;
  isImportDialogOpen: boolean;
  isErDialogOpen: boolean;
  isAISchemaPatchOpen: boolean;
  isClearDialogOpen: boolean;
  showFireworks: boolean;
  isDiffDialogOpen: boolean;
  versionHistoryTarget: VersionHistoryTarget | null;
  timelinePlayerTarget: VersionHistoryTarget | null;
  isReviewHistoryOpen: boolean;
  isStorageEstimatorOpen: boolean;
  isAIGenerateDialogOpen: boolean;
  isMockDataDialogOpen: boolean;
  setWorkspaceSidebarOpen: (open: boolean) => void;
  setOutputPanelOpen: (open: boolean) => void;
  setSavedTablesDrawerOpen: (open: boolean) => void;
  setIsImportDialogOpen: (open: boolean) => void;
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

export const useAppUiStore = create<AppUiState>((set) => ({
  workspaceSidebarOpen: true,
  outputPanelOpen: true,
  savedTablesDrawerOpen: false,
  dialogs: {
    save: false,
    rename: false,
    delete: false,
  },
  isImportDialogOpen: false,
  isErDialogOpen: false,
  isAISchemaPatchOpen: false,
  isClearDialogOpen: false,
  showFireworks: false,
  isDiffDialogOpen: false,
  versionHistoryTarget: null,
  timelinePlayerTarget: null,
  isReviewHistoryOpen: false,
  isStorageEstimatorOpen: false,
  isAIGenerateDialogOpen: false,
  isMockDataDialogOpen: false,
  setWorkspaceSidebarOpen: (workspaceSidebarOpen) => set({ workspaceSidebarOpen }),
  setOutputPanelOpen: (outputPanelOpen) => set({ outputPanelOpen }),
  setSavedTablesDrawerOpen: (savedTablesDrawerOpen) => set({ savedTablesDrawerOpen }),
  setIsImportDialogOpen: (isImportDialogOpen) => set({ isImportDialogOpen }),
  setIsErDialogOpen: (isErDialogOpen) => set({ isErDialogOpen }),
  setIsAISchemaPatchOpen: (isAISchemaPatchOpen) => set({ isAISchemaPatchOpen }),
  setIsSaveDialogOpen: (open) => set((state) => ({ dialogs: { ...state.dialogs, save: open } })),
  setIsRenameDialogOpen: (open) =>
    set((state) => ({ dialogs: { ...state.dialogs, rename: open } })),
  setIsDeleteDialogOpen: (open) =>
    set((state) => ({ dialogs: { ...state.dialogs, delete: open } })),
  setIsClearDialogOpen: (isClearDialogOpen) => set({ isClearDialogOpen }),
  setShowFireworks: (showFireworks) => set({ showFireworks }),
  setIsDiffDialogOpen: (isDiffDialogOpen) => set({ isDiffDialogOpen }),
  setVersionHistoryTarget: (versionHistoryTarget) => set({ versionHistoryTarget }),
  setTimelinePlayerTarget: (timelinePlayerTarget) => set({ timelinePlayerTarget }),
  setIsReviewHistoryOpen: (isReviewHistoryOpen) => set({ isReviewHistoryOpen }),
  setIsStorageEstimatorOpen: (isStorageEstimatorOpen) => set({ isStorageEstimatorOpen }),
  setIsAIGenerateDialogOpen: (isAIGenerateDialogOpen) => set({ isAIGenerateDialogOpen }),
  setIsMockDataDialogOpen: (isMockDataDialogOpen) => set({ isMockDataDialogOpen }),
}));
