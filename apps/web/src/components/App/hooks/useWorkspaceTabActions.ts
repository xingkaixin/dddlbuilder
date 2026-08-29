import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { DraftSummary, WorkspaceSelection } from '@ddlbuilder/shared-types/workspace';
import { useToast } from '@/hooks/useToast';
import type { SavedTableSummary } from '@/hooks/useSavedTables';
import { useTabStore } from '@/stores';
import { createEmptyRow } from '@/utils/helpers';
import { EXAMPLE_USER_PROFILE_TABLE } from '@/utils/exampleTable';
import { applySavedState } from '../applySavedState';
import type { useTabLifecycle } from './useTabLifecycle';

const createEmptyDraftState = (): PersistedState => ({
  schemaName: '',
  tableName: '',
  tableComment: '',
  dbType: 'mysql',
  sqlFormatMode: 'compact',
  rows: Array.from({ length: 12 }, () => createEmptyRow()),
  addCount: 10,
  indexes: [],
  authInput: '',
  authObjects: [],
});

type TabLifecycle = Pick<
  ReturnType<typeof useTabLifecycle>,
  | 'tabs'
  | 'addTab'
  | 'activateTab'
  | 'findTabBySource'
  | 'getActiveTab'
  | 'hydrateTab'
  | 'flushActiveTab'
  | 'showTab'
  | 'switchToTab'
  | 'closeTab'
>;

interface UseWorkspaceTabActionsParams {
  tabs: TabLifecycle;
  setSavedTablesDrawerOpen: (open: boolean) => void;
  buildPersistedState: () => PersistedState;
  loadSavedTable: (item: SavedTableSummary) => Promise<{
    source: Extract<WorkspaceSelection, { kind: 'saved_table' }>;
    state: PersistedState;
    version: number;
  } | null>;
  draftSummaries: DraftSummary[];
  getDraftState: (draftId: string) => PersistedState | null;
  selectWorkspaceSnapshot: (source: WorkspaceSelection, state: PersistedState) => void;
  setWorkspaceSnapshot: (source: WorkspaceSelection, state: PersistedState) => void;
  createDraft: (draftId: string, state: PersistedState) => string;
  deleteDraftById: (draftId: string) => void;
}

export function useWorkspaceTabActions({
  tabs,
  setSavedTablesDrawerOpen,
  buildPersistedState,
  loadSavedTable,
  draftSummaries,
  getDraftState,
  selectWorkspaceSnapshot,
  setWorkspaceSnapshot,
  createDraft,
  deleteDraftById,
}: UseWorkspaceTabActionsParams) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const {
    tabs: openTabs,
    addTab,
    activateTab,
    findTabBySource,
    getActiveTab,
    hydrateTab,
    flushActiveTab,
    showTab,
    switchToTab,
    closeTab,
  } = tabs;

  const handleSelectSavedTable = useCallback(
    async (item: SavedTableSummary) => {
      setSavedTablesDrawerOpen(false);

      const existingTab = findTabBySource({
        kind: 'saved_table',
        normalizedName: item.normalizedName,
        tableId: item.tableId,
      });
      if (existingTab) {
        switchToTab(existingTab);
        return;
      }

      if (openTabs.length > 0) flushActiveTab();

      const newTabId = addTab({
        title: item.name,
        source: {
          kind: 'saved_table',
          normalizedName: item.normalizedName,
          tableId: item.tableId,
          tableName: item.name,
          baseSignature: '',
        },
        stateSnapshot: buildPersistedState(),
        isLoading: true,
      });
      activateTab(newTabId);

      const result = await loadSavedTable(item);
      const isLoadedTabActive = useTabStore.getState().activeTabId === newTabId;
      if (!result) {
        closeTab(newTabId);
        if (isLoadedTabActive) {
          const currentTab = getActiveTab();
          if (currentTab) showTab(currentTab);
        }
        return;
      }

      hydrateTab(newTabId, result.source, result.state);
      if (useTabStore.getState().activeTabId === newTabId) {
        applySavedState(result.state);
        selectWorkspaceSnapshot(result.source, result.state);
        showToast(`已加载：${result.source.tableName} (v${result.version})`);
      }
    },
    [
      activateTab,
      addTab,
      buildPersistedState,
      closeTab,
      findTabBySource,
      flushActiveTab,
      getActiveTab,
      hydrateTab,
      loadSavedTable,
      openTabs.length,
      setSavedTablesDrawerOpen,
      showTab,
      showToast,
      switchToTab,
      selectWorkspaceSnapshot,
    ],
  );

  const handleSelectDraft = useCallback(
    (draftId: string) => {
      setSavedTablesDrawerOpen(false);

      const existingTab = findTabBySource({ kind: 'draft', draftId });
      if (existingTab) {
        switchToTab(existingTab);
        return;
      }

      if (openTabs.length > 0) flushActiveTab();

      const existingState = getDraftState(draftId);
      const nextState = existingState ?? createEmptyDraftState();
      const draftName =
        draftSummaries.find((draft) => draft.draftId === draftId)?.name ??
        t('app.workspace.globalDraft');
      const newTabId = addTab({
        title: draftName,
        source: { kind: 'draft', draftId },
        stateSnapshot: nextState,
      });
      activateTab(newTabId);
      applySavedState(nextState);
      selectWorkspaceSnapshot({ kind: 'draft', draftId }, nextState);
      showToast(existingState ? t('app.loadedDraft') : t('app.emptyDraftCreated'));
    },
    [
      activateTab,
      addTab,
      draftSummaries,
      findTabBySource,
      flushActiveTab,
      getDraftState,
      openTabs.length,
      selectWorkspaceSnapshot,
      setSavedTablesDrawerOpen,
      showToast,
      t,
      switchToTab,
    ],
  );

  const openStateInNewDraftTab = useCallback(
    (initialState: PersistedState) => {
      if (openTabs.length > 0) flushActiveTab();
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
    [activateTab, addTab, createDraft, flushActiveTab, openTabs.length, setWorkspaceSnapshot],
  );

  const handleDeleteDraft = useCallback(
    (draftId: string) => {
      deleteDraftById(draftId);
      const tab = findTabBySource({ kind: 'draft', draftId });
      if (tab) closeTab(tab.id);
      showToast(t('app.draftDeleted'));
    },
    [closeTab, deleteDraftById, findTabBySource, showToast, t],
  );

  const handleCreateDraft = useCallback(
    () => openStateInNewDraftTab(createEmptyDraftState()),
    [openStateInNewDraftTab],
  );

  const handleLoadExample = useCallback(() => {
    openStateInNewDraftTab(EXAMPLE_USER_PROFILE_TABLE);
    showToast(t('emptyState.exampleLoaded'));
  }, [openStateInNewDraftTab, showToast, t]);

  return {
    handleSelectSavedTable,
    handleSelectDraft,
    openStateInNewDraftTab,
    handleDeleteDraft,
    handleCreateDraft,
    handleLoadExample,
  };
}
