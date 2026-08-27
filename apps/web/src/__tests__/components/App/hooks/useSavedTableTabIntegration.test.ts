import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
    const tabs = {
      updateActiveTabTitle: vi.fn(),
      updateActiveTabSource: vi.fn(),
      updateActiveTabSnapshot: vi.fn(),
      renameSavedTableTabs: vi.fn(),
      closeTabBySource: vi.fn(),
    };
    const state = { tableName: 'Users' } as never;
    const { result } = renderHook(() =>
      useSavedTableTabIntegration({
        isShareView: false,
        workspaceScope: { kind: 'anonymous' },
        activeSource: { kind: 'draft', draftId: 'draft-a' },
        deleteDraftById,
        removeSavedTableDraft,
        buildPersistedState: () => state,
        tabs,
      }),
    );

    await act(async () => {
      await result.current.onSaveSuccess({
        normalizedName: 'users',
        displayName: 'Users',
        baseSignature: 'signature',
        mode: 'create',
      });
    });

    expect(deleteDraftById).toHaveBeenCalledWith('draft-a');
    expect(removeSavedTableDraft).toHaveBeenCalledWith('users');
    expect(tabs.updateActiveTabSource).toHaveBeenCalledWith({
      kind: 'saved_table',
      normalizedName: 'users',
      tableName: 'Users',
      baseSignature: 'signature',
    });
    expect(tabs.updateActiveTabSnapshot).toHaveBeenCalledWith(state);
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
});
