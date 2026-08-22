import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSavedTableTabIntegration } from '@/components/App/hooks/useSavedTableTabIntegration';

describe('useSavedTableTabIntegration', () => {
  it('首次保存草稿时切换标签来源并删除旧草稿', async () => {
    const deleteDraftById = vi.fn();
    const removeSavedTableDraft = vi.fn();
    const tabs = {
      updateActiveTabTitle: vi.fn(),
      updateActiveTabSource: vi.fn(),
      updateActiveTabSnapshot: vi.fn(),
      updateTabTitleBySource: vi.fn(),
      removeTabBySource: vi.fn(),
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

  it('重命名和删除保存表时更新对应标签', () => {
    const tabs = {
      updateActiveTabTitle: vi.fn(),
      updateActiveTabSource: vi.fn(),
      updateActiveTabSnapshot: vi.fn(),
      updateTabTitleBySource: vi.fn(),
      removeTabBySource: vi.fn(),
    };
    const { result } = renderHook(() =>
      useSavedTableTabIntegration({
        isShareView: false,
        workspaceScope: { kind: 'anonymous' },
        activeSource: { kind: 'draft', draftId: 'draft-a' },
        deleteDraftById: vi.fn(),
        removeSavedTableDraft: vi.fn(),
        buildPersistedState: vi.fn(),
        tabs,
      }),
    );

    act(() => result.current.onTabRename('old', 'new', 'New'));
    act(() => result.current.onTabRemove('new'));

    expect(tabs.updateTabTitleBySource).toHaveBeenCalledWith(
      { kind: 'saved_table', normalizedName: 'old' },
      'New',
    );
    expect(tabs.removeTabBySource).toHaveBeenCalledWith({
      kind: 'saved_table',
      normalizedName: 'new',
    });
  });
});
