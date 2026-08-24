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
  indexInput: '',
  currentIndexFields: [],
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
        getCurrentState: () => createState('active'),
        serializePersistedState: JSON.stringify,
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
        getCurrentState: () => createState('placeholder'),
        serializePersistedState: JSON.stringify,
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
      serializePersistedState: JSON.stringify,
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
        getCurrentState: () => savedState,
        serializePersistedState: JSON.stringify,
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
        getCurrentState: () => savedState,
        serializePersistedState: JSON.stringify,
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
