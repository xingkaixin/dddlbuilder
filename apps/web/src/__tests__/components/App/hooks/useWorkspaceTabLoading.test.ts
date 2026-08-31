import { act, renderHook } from '@testing-library/react';
import { assert, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceSelection } from '@ddlbuilder/shared-types/workspace';
import { useTabLifecycle } from '@/components/App/hooks/useTabLifecycle';
import { useWorkspacePresentation } from '@/components/App/hooks/useWorkspacePresentation';
import { useWorkspaceTabActions } from '@/components/App/hooks/useWorkspaceTabActions';
import { toPersistedState } from '@/stores/editorDocumentCodec';
import { useEditorStore } from '@/stores/editorStore';
import { useTabStore } from '@/stores/tabStore';

const createSource = (name: string) => ({
  kind: 'saved_table' as const,
  tableId: name,
  normalizedName: name,
  tableName: name,
  baseSignature: name,
});

describe('workspace tab loading', () => {
  beforeEach(() => {
    useTabStore.setState({ tabs: [], activeTabId: null });
    useEditorStore.getState().replaceDocument(toPersistedState(useEditorStore.getInitialState()));
  });

  it.each(['switch', 'close'] as const)(
    '通过 %s 回到加载中的标签时保留加载界面直到实际请求完成',
    async (returnAction) => {
      const alphaState = {
        ...toPersistedState(useEditorStore.getInitialState()),
        tableName: 'alpha',
      };
      const betaState = { ...alphaState, tableName: 'beta', tableComment: 'loaded comment' };
      useEditorStore.getState().replaceDocument(alphaState);
      const alphaId = useTabStore.getState().addTab({
        title: 'alpha',
        source: createSource('alpha'),
        stateSnapshot: alphaState,
      });
      let finishLoading!: () => void;
      const pending = new Promise<void>((resolve) => {
        finishLoading = resolve;
      });
      const selectWorkspaceSnapshot = vi.fn();
      const resolveWorkspaceSnapshot = vi.fn((source: WorkspaceSelection) => ({
        source,
        state: source.kind === 'saved_table' && source.tableId === 'beta' ? betaState : alphaState,
      }));
      const { result } = renderHook(() => {
        const tabs = useTabLifecycle({
          enabled: true,
          activeTableName: useEditorStore((state) => state.tableName),
          getCurrentState: () => toPersistedState(useEditorStore.getState()),
          saveState: vi.fn(),
          selectWorkspaceSnapshot,
          resolveWorkspaceSnapshot,
          resetWorkspaceSelection: vi.fn(),
        });
        const actions = useWorkspaceTabActions({
          tabs,
          setSavedTablesDrawerOpen: vi.fn(),
          buildPersistedState: () => toPersistedState(useEditorStore.getState()),
          loadSavedTable: async () => {
            await pending;
            return { source: createSource('beta'), state: betaState, version: 1 };
          },
          draftSummaries: [],
          getDraftState: () => null,
          selectWorkspaceSnapshot,
          setWorkspaceSnapshot: vi.fn(),
          createDraft: vi.fn(),
          deleteDraftById: vi.fn(),
        });
        const presentation = useWorkspacePresentation({
          activeSourceKind: 'saved_table',
          activeTabId: tabs.activeTabId,
          activeWorkspaceTab: tabs.activeWorkspaceTab,
          draftSummaries: [],
          hydrated: true,
          isLoadedDirty: false,
          savedTables: [],
          tabs: tabs.tabs,
        });
        return { tabs, actions, presentation };
      });

      let loading: Promise<void>;
      act(() => {
        loading = result.current.actions.handleSelectSavedTable({
          tableId: 'beta',
          normalizedName: 'beta',
          name: 'beta',
          dbType: 'mysql',
          fieldCount: 0,
          createdAt: 1,
          updatedAt: 1,
        });
      });
      const betaId = result.current.tabs.activeTabId;
      assert(betaId);
      expect(result.current.presentation.shouldShowWorkspaceSkeleton).toBe(true);

      act(() => result.current.tabs.switchToTabById(alphaId));
      expect(result.current.presentation.shouldShowWorkspaceSkeleton).toBe(false);
      resolveWorkspaceSnapshot.mockClear();
      selectWorkspaceSnapshot.mockClear();

      act(() => {
        if (returnAction === 'switch') result.current.tabs.switchToTabById(betaId);
        else result.current.tabs.closeTab(alphaId);
      });

      expect(result.current.tabs.activeTabId).toBe(betaId);
      expect(result.current.presentation.shouldShowWorkspaceSkeleton).toBe(true);
      expect(resolveWorkspaceSnapshot).not.toHaveBeenCalled();
      expect(selectWorkspaceSnapshot).not.toHaveBeenCalled();

      await act(async () => {
        finishLoading();
        await loading;
      });

      expect(result.current.presentation.shouldShowWorkspaceSkeleton).toBe(false);
      expect(useEditorStore.getState()).toMatchObject({
        tableName: 'beta',
        tableComment: 'loaded comment',
      });
      expect(selectWorkspaceSnapshot).toHaveBeenCalledWith(createSource('beta'), betaState);
    },
  );
});
