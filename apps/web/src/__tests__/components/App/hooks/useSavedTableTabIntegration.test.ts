import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSaveLoadActions } from '@/components/App/hooks/savedTableFlow/saveLoadActions';
import { useDialogState } from '@/hooks/useDialogState';
import { useSavedTableTabIntegration } from '@/components/App/hooks/useSavedTableTabIntegration';
import { useTabLifecycle } from '@/components/App/hooks/useTabLifecycle';
import { useTabStore } from '@/stores/tabStore';
import { useEditorStore } from '@/stores/editorStore';
import { toPersistedState } from '@/stores/editorDocumentCodec';
import { serializePersistedStateForComparison } from '@/utils/persistedStateSignature';

describe('useSavedTableTabIntegration', () => {
  beforeEach(() => useTabStore.setState({ tabs: [], activeTabId: null }));
  it('首次保存草稿时切换标签来源并删除旧草稿', async () => {
    const deleteDraftById = vi.fn();
    const removeSavedTableDraft = vi.fn();
    const state = { ...toPersistedState(useEditorStore.getInitialState()), tableName: 'Users' };
    const tabId = useTabStore.getState().addTab({
      title: 'Draft',
      source: { kind: 'draft', draftId: 'draft-a' },
      stateSnapshot: state,
    });
    const tabs = { ...useTabStore.getState(), closeTabBySource: vi.fn() };
    const signature = serializePersistedStateForComparison(state);
    const { result } = renderHook(() =>
      useSavedTableTabIntegration({
        isShareView: false,
        workspaceScope: { kind: 'anonymous' },
        activeSource: { kind: 'draft', draftId: 'draft-a' },
        deleteDraftById,
        removeSavedTableDraft,
        persistSavedTableDraft: vi.fn(),
        selectWorkspaceSnapshot: vi.fn(),
        buildPersistedState: () => state,
        tabs,
      }),
    );

    await act(async () => {
      await result.current.onSaveSuccess({
        normalizedName: 'users',
        displayName: 'Users',
        baseSignature: signature,
        mode: 'create',
      });
    });

    expect(deleteDraftById).toHaveBeenCalledWith('draft-a');
    expect(removeSavedTableDraft).toHaveBeenCalledWith(
      expect.objectContaining({ normalizedName: 'users' }),
    );
    expect(tabs.getTabById(tabId)).toMatchObject({
      title: 'Users',
      source: {
        kind: 'saved_table',
        normalizedName: 'users',
        tableName: 'Users',
        baseSignature: signature,
      },
      stateSnapshot: state,
    });
  });

  it.each([true, false])('重命名后仍可切换和关闭标签（初始激活=%s）', (active) => {
    const state = toPersistedState(useEditorStore.getInitialState());
    const source = {
      kind: 'saved_table' as const,
      normalizedName: 'old',
      tableName: 'Old',
      baseSignature: serializePersistedStateForComparison(state),
    };
    const savedTabId = useTabStore
      .getState()
      .addTab({ title: 'Old', source, stateSnapshot: state });
    const draftTabId = useTabStore.getState().addTab({
      title: 'Draft',
      source: { kind: 'draft', draftId: 'draft-a' },
      stateSnapshot: state,
    });
    if (active) useTabStore.getState().activateTab(savedTabId);
    const selectWorkspaceSnapshot = vi.fn();
    const { result, unmount } = renderHook(() => {
      const tabs = useTabLifecycle({
        enabled: true,
        getCurrentState: () => state,
        serializePersistedState: serializePersistedStateForComparison,
        saveState: vi.fn(),
        selectWorkspaceSnapshot,
        resolveWorkspaceSnapshot: () => null,
        resetWorkspaceSelection: vi.fn(),
      });
      return {
        tabs,
        ...useSavedTableTabIntegration({
          isShareView: false,
          workspaceScope: { kind: 'anonymous' },
          activeSource: tabs.activeWorkspaceTab?.source ?? source,
          deleteDraftById: vi.fn(),
          removeSavedTableDraft: vi.fn(),
          persistSavedTableDraft: vi.fn(),
          selectWorkspaceSnapshot,
          buildPersistedState: () => state,
          tabs,
        }),
      };
    });
    act(() => result.current.onTabRename('old', 'new', 'New'));
    act(() => result.current.tabs.switchToTabById(draftTabId));
    act(() => result.current.tabs.switchToTabById(savedTabId));
    expect(selectWorkspaceSnapshot).toHaveBeenLastCalledWith(
      {
        ...source,
        normalizedName: 'new',
        tableName: 'New',
      },
      state,
    );
    act(() => result.current.onTabRemove('new'));
    expect(useTabStore.getState().tabs.map((tab) => tab.id)).toEqual([draftTabId]);
    unmount();
  });

  it.each([
    ['version', 'switch'],
    ['table', 'switch'],
    ['table', 'close'],
    ['table', 'edit'],
  ] as const)('等待 %s 时 %s 不会被保存回调覆盖', async (pendingStage, action) => {
    const original = {
      ...toPersistedState(useEditorStore.getInitialState()),
      tableName: 'users',
    };
    const other = { ...original, tableName: 'orders' };
    let editorState = original;
    const getCurrentState = () => editorState;
    const store = useTabStore.getState();
    const firstId = store.addTab({
      title: 'users',
      source: { kind: 'draft', draftId: 'first' },
      stateSnapshot: original,
    });
    const secondId = store.addTab({
      title: 'orders',
      source: { kind: 'draft', draftId: 'second' },
      stateSnapshot: other,
    });
    store.activateTab(firstId);
    const pending = Promise.withResolvers<void>();
    const saveTable = vi.fn(async () => {
      if (pendingStage === 'table') await pending.promise;
      return { ok: true as const, normalizedName: 'users' };
    });
    const createTableVersion = vi.fn(async () => {
      if (pendingStage === 'version') await pending.promise;
    });
    const selectWorkspaceSnapshot = vi.fn();
    const persistSavedTableDraft = vi.fn();
    const removeSavedTableDraft = vi.fn();
    const setLoadedTableVersion = vi.fn();
    const { result, unmount } = renderHook(() => {
      const tabs = useTabLifecycle({
        enabled: true,
        getCurrentState,
        serializePersistedState: serializePersistedStateForComparison,
        saveState: vi.fn(),
        selectWorkspaceSnapshot,
        resolveWorkspaceSnapshot: () => null,
        resetWorkspaceSelection: vi.fn(),
      });
      const integration = useSavedTableTabIntegration({
        isShareView: false,
        workspaceScope: { kind: 'anonymous' },
        activeSource: tabs.activeWorkspaceTab?.source ?? { kind: 'draft', draftId: 'first' },
        deleteDraftById: vi.fn(),
        removeSavedTableDraft,
        persistSavedTableDraft,
        selectWorkspaceSnapshot,
        buildPersistedState: getCurrentState,
        tabs,
      });
      const saveDialog = useDialogState({
        open: true,
        setOpen: vi.fn(),
        initialData: { name: 'users' },
      });
      const flow = useSaveLoadActions({
        tableName: editorState.tableName,
        hasLoadedTable: false,
        canSaveCurrent: true,
        loadedTableSource: null,
        setLoadedTableVersion,
        saveDialog,
        buildPersistedState: getCurrentState,
        serializePersistedState: serializePersistedStateForComparison,
        loadTable: vi.fn(),
        saveTable,
        overwriteTable: vi.fn(),
        countTableVersions: vi.fn(async () => 1),
        createTableVersion,
        showToast: vi.fn(),
        onSaveSuccess: integration.onSaveSuccess,
      });
      return { tabs, flow };
    });

    let saving!: Promise<void>;
    act(() => {
      saving = result.current.flow.handleConfirmSave();
    });
    await waitFor(() =>
      expect(pendingStage === 'version' ? createTableVersion : saveTable).toHaveBeenCalled(),
    );
    act(() => {
      if (action === 'edit') {
        editorState = { ...original, tableComment: '继续编辑' };
      } else {
        if (action === 'close') result.current.tabs.closeTab(firstId);
        else result.current.tabs.switchToTabById(secondId);
        editorState = other;
        selectWorkspaceSnapshot.mockClear();
      }
    });
    await act(async () => {
      pending.resolve();
      await saving;
    });

    expect(createTableVersion).toHaveBeenCalledWith(
      { normalizedName: 'users', tableId: undefined },
      original,
      expect.any(String),
    );
    expect(setLoadedTableVersion).toHaveBeenCalledWith(1, {
      normalizedName: 'users',
      tableId: undefined,
    });
    expect(store.getTabById(secondId)).toMatchObject({
      title: 'orders',
      source: { kind: 'draft', draftId: 'second' },
      stateSnapshot: other,
    });
    const savedSource = {
      kind: 'saved_table',
      normalizedName: 'users',
      tableName: 'users',
      baseSignature: serializePersistedStateForComparison(original),
    };
    const expectedSavedTab = {
      id: firstId,
      title: 'users',
      source: savedSource,
      isLoading: false,
      stateSnapshot: action === 'edit' ? editorState : original,
    };
    expect(store.getTabById(firstId)).toEqual(action === 'close' ? undefined : expectedSavedTab);
    const draftCall = [
      savedSource,
      {
        state: editorState,
        tableName: 'users',
        baseSignature: savedSource.baseSignature,
        updatedAt: expect.any(Number),
      },
    ];
    expect(persistSavedTableDraft.mock.calls).toEqual(action === 'edit' ? [draftCall] : []);
    expect(removeSavedTableDraft.mock.calls).toEqual(action === 'switch' ? [[savedSource]] : []);
    expect(selectWorkspaceSnapshot.mock.calls).toEqual(
      action === 'edit' ? [[savedSource, editorState]] : [],
    );
    expect(useTabStore.getState().activeTabId).toBe(action === 'edit' ? firstId : secondId);
    unmount();
  });
});
