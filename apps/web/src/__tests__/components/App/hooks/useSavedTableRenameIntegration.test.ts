import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRenameDeleteActions } from '@/components/App/hooks/savedTableFlow/renameDeleteActions';
import { useSavedTableTabIntegration } from '@/components/App/hooks/useSavedTableTabIntegration';
import { useTabLifecycle } from '@/components/App/hooks/useTabLifecycle';
import { useDialogState } from '@/hooks/useDialogState';
import type { SaveTableResult, SavedTableSummary } from '@/hooks/useSavedTables';
import { useEditorStore } from '@/stores/editorStore';
import { toPersistedState } from '@/stores/editorDocumentCodec';
import { useTabStore } from '@/stores/tabStore';
import { buildSchemaStateSignature } from '@/utils/persistedStateSignature';

const getCurrentState = () => toPersistedState(useEditorStore.getState());

describe('saved table rename integration', () => {
  beforeEach(() => {
    useTabStore.setState({ tabs: [], activeTabId: null });
    useEditorStore.getState().resetDocument();
  });

  it.each(['switch', 'edit'] as const)(
    '等待重命名时 %s 后只更新目标标签对应的当前选择',
    async (action) => {
      const original = { ...getCurrentState(), tableName: 'users' };
      const other = { ...original, tableName: 'orders' };
      const source = {
        kind: 'saved_table' as const,
        tableId: 'users-id',
        normalizedName: 'users',
        tableName: 'Users',
        baseSignature: buildSchemaStateSignature(original),
      };
      const store = useTabStore.getState();
      const targetTabId = store.addTab({ title: 'Users', source, stateSnapshot: original });
      const otherTabId = store.addTab({
        title: 'Orders',
        source: { kind: 'draft', draftId: 'orders-draft' },
        stateSnapshot: other,
      });
      store.activateTab(targetTabId);
      useEditorStore.getState().replaceDocument(original);
      let completeRename!: (result: SaveTableResult) => void;
      const pending = new Promise<SaveTableResult>((resolve) => {
        completeRename = resolve;
      });
      const selectWorkspaceSnapshot = vi.fn();
      const { result } = renderHook(() => {
        const tabs = useTabLifecycle({
          enabled: true,
          activeTableName: useEditorStore((state) => state.tableName),
          getCurrentState,
          saveState: vi.fn(),
          selectWorkspaceSnapshot,
          resolveWorkspaceSnapshot: () => null,
          resetWorkspaceSelection: vi.fn(),
        });
        const integration = useSavedTableTabIntegration({
          isShareView: false,
          workspaceScope: { kind: 'anonymous' },
          activeSource: tabs.activeWorkspaceTab?.source ?? source,
          deleteDraftById: vi.fn(),
          removeSavedTableDraft: vi.fn(),
          persistSavedTableDraft: vi.fn(),
          selectWorkspaceSnapshot,
          buildPersistedState: getCurrentState,
          tabs,
        });
        const renameDialog = useDialogState<{ name: string; target: SavedTableSummary | null }>({
          open: true,
          setOpen: vi.fn(),
          initialData: {
            name: 'Renamed users',
            target: {
              tableId: source.tableId,
              normalizedName: source.normalizedName,
              name: source.tableName,
              dbType: original.dbType,
              fieldCount: 0,
              createdAt: 1,
              updatedAt: 1,
            },
          },
        });
        const deleteDialog = useDialogState<{ target: SavedTableSummary | null }>({
          open: false,
          setOpen: vi.fn(),
          initialData: { target: null },
        });
        const flow = useRenameDeleteActions({
          renameDialog,
          deleteDialog,
          renameTable: () => pending,
          deleteTable: vi.fn(),
          showToast: vi.fn(),
          onTabRename: integration.onTabRename,
        });
        return { tabs, flow };
      });

      let renaming!: Promise<void>;
      act(() => {
        renaming = result.current.flow.handleConfirmRename();
      });
      act(() => {
        if (action === 'switch') result.current.tabs.switchToTabById(otherTabId);
        else useEditorStore.getState().setTableComment('Edited during rename');
      });
      const latestState = getCurrentState();
      selectWorkspaceSnapshot.mockClear();

      await act(async () => {
        completeRename({
          ok: true,
          normalizedName: 'renamed_users',
          tableId: source.tableId,
        });
        await renaming;
      });

      const renamedSource = {
        ...source,
        normalizedName: 'renamed_users',
        tableName: 'Renamed users',
      };
      expect(store.getTabById(targetTabId)).toMatchObject({
        title: 'Renamed users',
        source: renamedSource,
        stateSnapshot: original,
      });
      expect(store.getTabById(otherTabId)).toMatchObject({
        source: { kind: 'draft', draftId: 'orders-draft' },
        stateSnapshot: other,
      });
      expect(getCurrentState()).toEqual(latestState);
      expect(useTabStore.getState().activeTabId).toBe(
        action === 'switch' ? otherTabId : targetTabId,
      );
      expect(selectWorkspaceSnapshot.mock.calls).toEqual(
        action === 'switch' ? [] : [[renamedSource, latestState]],
      );
    },
  );

  it('重命名加载中的表时不把上一张表的编辑内容关联到目标表', () => {
    const state = { ...getCurrentState(), tableName: 'previous_table' };
    const source = {
      kind: 'saved_table' as const,
      tableId: 'loading-id',
      normalizedName: 'loading',
      tableName: 'Loading',
      baseSignature: '',
    };
    const tabId = useTabStore.getState().addTab({
      title: 'Loading',
      source,
      stateSnapshot: state,
      isLoading: true,
    });
    const selectWorkspaceSnapshot = vi.fn();
    const { result } = renderHook(() =>
      useSavedTableTabIntegration({
        isShareView: false,
        workspaceScope: { kind: 'anonymous' },
        activeSource: source,
        deleteDraftById: vi.fn(),
        removeSavedTableDraft: vi.fn(),
        persistSavedTableDraft: vi.fn(),
        selectWorkspaceSnapshot,
        buildPersistedState: () => state,
        tabs: { ...useTabStore.getState(), closeTabBySource: vi.fn() },
      }),
    );

    act(() => result.current.onTabRename(source, 'renamed', 'Renamed'));

    expect(useTabStore.getState().getTabById(tabId)).toMatchObject({
      source: { ...source, normalizedName: 'renamed', tableName: 'Renamed' },
      stateSnapshot: state,
      isLoading: true,
    });
    expect(selectWorkspaceSnapshot).not.toHaveBeenCalled();
  });
});
