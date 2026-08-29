import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { useTabLifecycle } from '@/components/App/hooks/useTabLifecycle';
import { useTabStore } from '@/stores';

const mocks = vi.hoisted(() => ({ applySavedState: vi.fn() }));

vi.mock('@/components/App/applySavedState', () => ({
  applySavedState: mocks.applySavedState,
}));

const createState = (tableName: string): PersistedState => ({
  schemaName: '',
  tableName,
  tableComment: '',
  dbType: 'mysql',
  sqlFormatMode: 'compact',
  rows: [],
  addCount: 1,
  indexes: [],
  authInput: '',
  authObjects: [],
});

describe('useTabLifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTabStore.setState({ tabs: [], activeTabId: null });
  });

  it('激活标签时用权威快照替换非活动标签的旧状态', () => {
    const staleState = createState('stale');
    const remoteState = createState('remote');
    const store = useTabStore.getState();
    const staleTabId = store.addTab({
      title: 'Draft A',
      source: { kind: 'draft', draftId: 'draft-a' },
      stateSnapshot: staleState,
    });
    store.addTab({
      title: 'Draft B',
      source: { kind: 'draft', draftId: 'draft-b' },
      stateSnapshot: createState('active'),
    });
    const selectWorkspaceSnapshot = vi.fn();
    const resolveWorkspaceSnapshot = vi.fn(() => ({
      source: { kind: 'draft' as const, draftId: 'draft-a' },
      state: remoteState,
    }));

    const { result } = renderHook(() =>
      useTabLifecycle({
        enabled: true,
        activeTableName: 'active',
        getCurrentState: () => createState('active'),
        saveState: vi.fn(),
        selectWorkspaceSnapshot,
        resolveWorkspaceSnapshot,
        resetWorkspaceSelection: vi.fn(),
      }),
    );

    act(() => result.current.switchToTabById(staleTabId));

    expect(mocks.applySavedState).toHaveBeenCalledWith(remoteState);
    expect(selectWorkspaceSnapshot).toHaveBeenCalledWith(
      { kind: 'draft', draftId: 'draft-a' },
      remoteState,
    );
    expect(useTabStore.getState().tabs.find((tab) => tab.id === staleTabId)?.stateSnapshot).toBe(
      remoteState,
    );
  });

  it('离开加载中的标签时不持久化占位快照', () => {
    const store = useTabStore.getState();
    const targetTabId = store.addTab({
      title: 'Target',
      source: { kind: 'draft', draftId: 'target' },
      stateSnapshot: createState('target'),
    });
    store.addTab({
      title: 'Loading',
      source: {
        kind: 'saved_table',
        normalizedName: 'loading',
        tableName: 'Loading',
        baseSignature: '',
      },
      stateSnapshot: createState('placeholder'),
      isLoading: true,
    });
    const saveState = vi.fn();

    const { result } = renderHook(() =>
      useTabLifecycle({
        enabled: true,
        activeTableName: 'placeholder',
        getCurrentState: () => createState('placeholder'),
        saveState,
        selectWorkspaceSnapshot: vi.fn(),
        resolveWorkspaceSnapshot: () => null,
        resetWorkspaceSelection: vi.fn(),
      }),
    );

    act(() => result.current.switchToTabById(targetTabId));

    expect(saveState).not.toHaveBeenCalled();
  });

  it('编辑内容变化时保持标签命令稳定并读取最新状态', () => {
    const initialState = createState('initial');
    const latestState = createState('latest');
    useTabStore.getState().addTab({
      title: 'Draft',
      source: { kind: 'draft', draftId: 'draft-a' },
      stateSnapshot: initialState,
    });
    const saveState = vi.fn();
    const stableParams = {
      enabled: true,
      activeTableName: 'initial',
      saveState,
      selectWorkspaceSnapshot: vi.fn(),
      resolveWorkspaceSnapshot: () => null,
      resetWorkspaceSelection: vi.fn(),
    };

    let currentState = initialState;
    const getCurrentState = () => currentState;
    const { result, rerender } = renderHook(() =>
      useTabLifecycle({ ...stableParams, getCurrentState }),
    );
    const initialFlush = result.current.flushActiveTab;

    currentState = latestState;
    rerender();

    expect(result.current.flushActiveTab).toBe(initialFlush);
    act(() => result.current.flushActiveTab());
    expect(saveState).toHaveBeenCalledWith({
      state: latestState,
      source: { kind: 'draft', draftId: 'draft-a' },
    });
  });

  it('外部替换编辑器状态时只同步当前草稿标题', () => {
    const store = useTabStore.getState();
    const backgroundId = store.addTab({
      title: 'Background',
      source: { kind: 'draft', draftId: 'background' },
      stateSnapshot: createState('background'),
    });
    const activeId = store.addTab({
      title: 'Before import',
      source: { kind: 'draft', draftId: 'active' },
      stateSnapshot: createState('before_import'),
    });
    const stableParams = {
      enabled: true,
      getCurrentState: () => createState('before_import'),
      saveState: vi.fn(),
      selectWorkspaceSnapshot: vi.fn(),
      resolveWorkspaceSnapshot: () => null,
      resetWorkspaceSelection: vi.fn(),
    };
    const { rerender } = renderHook(
      ({ activeTableName }) => useTabLifecycle({ ...stableParams, activeTableName }),
      { initialProps: { activeTableName: 'before_import' } },
    );

    rerender({ activeTableName: 'imported_users' });
    expect(useTabStore.getState().getTabById(activeId)?.title).toBe('imported_users');
    rerender({ activeTableName: 'ai_adjusted_users' });
    expect(useTabStore.getState().getTabById(activeId)?.title).toBe('ai_adjusted_users');
    rerender({ activeTableName: 'remote_users' });
    expect(useTabStore.getState().getTabById(activeId)?.title).toBe('remote_users');
    expect(useTabStore.getState().getTabById(backgroundId)?.title).toBe('Background');
  });

  it('空草稿保持未命名标题', () => {
    const emptyState = createState('');
    const tabId = useTabStore.getState().addTab({
      title: '未命名草稿',
      source: { kind: 'draft', draftId: 'empty' },
      stateSnapshot: emptyState,
    });

    renderHook(() =>
      useTabLifecycle({
        enabled: true,
        activeTableName: '',
        getCurrentState: () => emptyState,
        saveState: vi.fn(),
        selectWorkspaceSnapshot: vi.fn(),
        resolveWorkspaceSnapshot: () => null,
        resetWorkspaceSelection: vi.fn(),
      }),
    );

    expect(useTabStore.getState().getTabById(tabId)?.title).toBe('未命名草稿');
  });

  it('切换草稿时等待编辑器状态匹配目标快照再同步标题', () => {
    const store = useTabStore.getState();
    const previousId = store.addTab({
      title: 'Previous',
      source: { kind: 'draft', draftId: 'previous' },
      stateSnapshot: createState('previous_table'),
    });
    const nextId = store.addTab({
      title: 'Next',
      source: { kind: 'draft', draftId: 'next' },
      stateSnapshot: createState('next_table'),
    });
    store.activateTab(previousId);
    const stableParams = {
      enabled: true,
      getCurrentState: () => createState('previous_table'),
      saveState: vi.fn(),
      selectWorkspaceSnapshot: vi.fn(),
      resolveWorkspaceSnapshot: () => null,
      resetWorkspaceSelection: vi.fn(),
    };
    const { rerender } = renderHook(
      ({ activeTableName }) => useTabLifecycle({ ...stableParams, activeTableName }),
      { initialProps: { activeTableName: 'previous_table' } },
    );

    act(() => useTabStore.getState().activateTab(nextId));
    expect(useTabStore.getState().getTabById(nextId)?.title).toBe('Next');

    rerender({ activeTableName: 'still_previous_table' });
    expect(useTabStore.getState().getTabById(nextId)?.title).toBe('Next');

    rerender({ activeTableName: 'next_table' });
    expect(useTabStore.getState().getTabById(nextId)?.title).toBe('next_table');
  });

  it('仅编辑器会话变化时也更新标签快照', () => {
    const initialState = createState('users');
    const latestState = {
      ...initialState,
      sqlFormatMode: 'aligned' as const,
      addCount: 20,
      fieldTableViewConfig: { freezeEnabled: true, freezeColumns: 2 },
    };
    useTabStore.getState().addTab({
      title: 'Draft',
      source: { kind: 'draft', draftId: 'draft-a' },
      stateSnapshot: initialState,
    });
    const saveState = vi.fn();
    const { result } = renderHook(() =>
      useTabLifecycle({
        enabled: true,
        activeTableName: 'users',
        getCurrentState: () => latestState,
        saveState,
        selectWorkspaceSnapshot: vi.fn(),
        resolveWorkspaceSnapshot: () => null,
        resetWorkspaceSelection: vi.fn(),
      }),
    );

    act(() => result.current.flushActiveTab());

    expect(useTabStore.getState().getActiveTab()?.stateSnapshot).toEqual(latestState);
    expect(saveState).toHaveBeenCalledWith({
      state: latestState,
      source: { kind: 'draft', draftId: 'draft-a' },
    });
  });

  it('删除当前保存表时加载相邻标签并同步工作区选择', () => {
    const draftState = createState('Draft');
    const savedState = createState('Saved');
    const savedSource = {
      kind: 'saved_table' as const,
      normalizedName: 'saved',
      tableName: 'Saved',
      baseSignature: JSON.stringify(savedState),
    };
    const store = useTabStore.getState();
    const draftTabId = store.addTab({
      title: 'Draft',
      source: { kind: 'draft', draftId: 'draft-a' },
      stateSnapshot: draftState,
    });
    store.addTab({ title: 'Saved', source: savedSource, stateSnapshot: savedState });
    const selectWorkspaceSnapshot = vi.fn();
    const resetWorkspaceSelection = vi.fn();

    const { result } = renderHook(() =>
      useTabLifecycle({
        enabled: true,
        activeTableName: 'Saved',
        getCurrentState: () => savedState,
        saveState: vi.fn(),
        selectWorkspaceSnapshot,
        resolveWorkspaceSnapshot: () => null,
        resetWorkspaceSelection,
      }),
    );

    act(() => result.current.closeTabBySource(savedSource));

    expect(useTabStore.getState().activeTabId).toBe(draftTabId);
    expect(mocks.applySavedState).toHaveBeenCalledWith(draftState);
    expect(selectWorkspaceSnapshot).toHaveBeenCalledWith(
      { kind: 'draft', draftId: 'draft-a' },
      draftState,
    );
    expect(resetWorkspaceSelection).not.toHaveBeenCalled();
  });

  it('关闭最后一个标签时清理工作区选择', () => {
    const savedState = createState('Saved');
    const savedSource = {
      kind: 'saved_table' as const,
      normalizedName: 'saved',
      tableName: 'Saved',
      baseSignature: JSON.stringify(savedState),
    };
    useTabStore
      .getState()
      .addTab({ title: 'Saved', source: savedSource, stateSnapshot: savedState });
    const resetWorkspaceSelection = vi.fn();

    const { result } = renderHook(() =>
      useTabLifecycle({
        enabled: true,
        activeTableName: 'Saved',
        getCurrentState: () => savedState,
        saveState: vi.fn(),
        selectWorkspaceSnapshot: vi.fn(),
        resolveWorkspaceSnapshot: () => null,
        resetWorkspaceSelection,
      }),
    );

    act(() => result.current.closeTabBySource(savedSource));

    expect(useTabStore.getState()).toMatchObject({ tabs: [], activeTabId: null });
    expect(resetWorkspaceSelection).toHaveBeenCalledOnce();
  });
});
