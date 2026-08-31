import { act, renderHook } from '@testing-library/react';
import { assert, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceSelection } from '@ddlbuilder/shared-types/workspace';
import * as Y from 'yjs';
import { useTabLifecycle } from '@/components/App/hooks/useTabLifecycle';
import { useWorkspacePresentation } from '@/components/App/hooks/useWorkspacePresentation';
import { useWorkspaceTabActions } from '@/components/App/hooks/useWorkspaceTabActions';
import { toEditorSessionSnapshot, toPersistedState } from '@/stores/editorDocumentCodec';
import { useEditorStore } from '@/stores/editorStore';
import { useTabStore } from '@/stores/tabStore';
import {
  getWorkspaceSnapshotFromYDoc,
  upsertSavedTableInYDoc,
} from '@/services/workspaceYDocAdapter';
import { createEmptyRow } from '@/utils/helpers';

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

  it.each(['switch', 'close', 'background'] as const)(
    '通过 %s 显示加载结果时保留加载状态并使用最新工作区快照',
    async (returnAction) => {
      const alphaState = {
        ...toPersistedState(useEditorStore.getInitialState()),
        tableName: 'alpha',
      };
      const betaState = { ...alphaState, tableName: 'beta', tableComment: 'loaded comment' };
      const doc = new Y.Doc();
      const remote = new Y.Doc();
      for (const state of [alphaState, betaState]) {
        upsertSavedTableInYDoc(doc, {
          tableId: state.tableName,
          normalizedName: state.tableName,
          name: state.tableName,
          state,
          createdAt: 1,
          updatedAt: 1,
        });
      }
      Y.applyUpdate(remote, Y.encodeStateAsUpdate(doc));
      const staleSnapshot = getWorkspaceSnapshotFromYDoc(
        doc,
        createSource('beta'),
        toEditorSessionSnapshot(useEditorStore.getState()),
      );
      assert(staleSnapshot?.source.kind === 'saved_table');
      const loadedSnapshot = { ...staleSnapshot, source: staleSnapshot.source, version: 1 };
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
      const saveState = vi.fn();
      const resolveWorkspaceSnapshot = vi.fn((source: WorkspaceSelection) =>
        getWorkspaceSnapshotFromYDoc(
          doc,
          source,
          toEditorSessionSnapshot(useEditorStore.getState()),
        ),
      );
      const { result, unmount } = renderHook(() => {
        const tabs = useTabLifecycle({
          enabled: true,
          activeTableName: useEditorStore((state) => state.tableName),
          getCurrentState: () => toPersistedState(useEditorStore.getState()),
          saveState,
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
            return loadedSnapshot;
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
        else if (returnAction === 'close') result.current.tabs.closeTab(alphaId);
      });

      const completedInBackground = returnAction === 'background';
      expect(result.current.tabs.activeTabId).toBe(completedInBackground ? alphaId : betaId);
      expect(result.current.presentation.shouldShowWorkspaceSkeleton).toBe(!completedInBackground);
      expect(resolveWorkspaceSnapshot).not.toHaveBeenCalled();
      expect(selectWorkspaceSnapshot).not.toHaveBeenCalled();

      act(() => {
        upsertSavedTableInYDoc(remote, {
          tableId: 'beta',
          normalizedName: 'beta',
          name: 'beta',
          state: {
            ...betaState,
            tableComment: 'remote comment',
            rows: [
              ...betaState.rows,
              { ...createEmptyRow(), fieldName: 'remote_column', fieldType: 'int' },
            ],
          },
          createdAt: 1,
          updatedAt: 2,
        });
        Y.applyUpdate(doc, Y.encodeStateAsUpdate(remote), 'remote');
      });

      await act(async () => {
        finishLoading();
        await loading;
      });

      expect(result.current.presentation.shouldShowWorkspaceSkeleton).toBe(false);
      expect(useEditorStore.getState().tableName).toBe(completedInBackground ? 'alpha' : 'beta');
      expect(selectWorkspaceSnapshot).toHaveBeenCalledTimes(completedInBackground ? 0 : 1);
      if (completedInBackground) act(() => result.current.tabs.switchToTabById(betaId));

      const authoritativeSnapshot = getWorkspaceSnapshotFromYDoc(
        doc,
        createSource('beta'),
        toEditorSessionSnapshot(useEditorStore.getState()),
      );
      assert(authoritativeSnapshot);
      expect(useEditorStore.getState()).toMatchObject({
        tableName: 'beta',
        tableComment: 'remote comment',
        rows: authoritativeSnapshot.state.rows,
      });
      expect(useEditorStore.getState().rows.at(-1)?.fieldName).toBe('remote_column');
      expect(useTabStore.getState().getActiveTab()).toMatchObject({
        source: authoritativeSnapshot.source,
        stateSnapshot: authoritativeSnapshot.state,
        isLoading: false,
      });
      expect(selectWorkspaceSnapshot).toHaveBeenLastCalledWith(
        authoritativeSnapshot.source,
        authoritativeSnapshot.state,
      );

      act(() => useEditorStore.getState().setTableComment('local comment'));
      act(() => result.current.tabs.flushActiveTab());
      expect(saveState).toHaveBeenLastCalledWith({
        source: authoritativeSnapshot.source,
        state: expect.objectContaining({
          tableComment: 'local comment',
          rows: authoritativeSnapshot.state.rows,
        }),
      });
      unmount();
      doc.destroy();
      remote.destroy();
    },
  );
});
