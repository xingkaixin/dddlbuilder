import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { WorkspaceSavePayload, WorkspaceSelection } from '@ddlbuilder/shared-types/workspace';
import { usePersistedSync } from '@/components/App/hooks/usePersistedSync';
import { buildSchemaStateSignature } from '@/utils/persistedStateSignature';

function createState(name: string): PersistedState {
  return {
    schemaName: '',
    tableName: name,
    tableComment: '',
    dbType: 'mysql',
    sqlFormatMode: 'compact',
    rows: [],
    addCount: 10,
    indexes: [],
    authInput: '',
    authObjects: [],
  };
}

interface PersistedSyncParams {
  hydrated: boolean;
  enabled: boolean;
  persistedState: PersistedState | null;
  activeSource: WorkspaceSelection;
  saveState: (payload: WorkspaceSavePayload) => void;
  currentState: PersistedState;
  getCurrentState: () => PersistedState;
  applyPersistedState: (state: PersistedState) => void;
}

const createBaseParams = (overrides: Partial<PersistedSyncParams> = {}): PersistedSyncParams => {
  const currentState = overrides.currentState ?? createState('a');
  return {
    hydrated: true,
    enabled: true,
    persistedState: null,
    activeSource: { kind: 'draft', draftId: 'default' },
    saveState: vi.fn(),
    currentState,
    getCurrentState: () => currentState,
    applyPersistedState: vi.fn(),
    ...overrides,
  };
};

describe('usePersistedSync', () => {
  it('does not rebuild a snapshot for unrelated renders', () => {
    const state = createState('users');
    const getCurrentState = vi.fn(() => state);
    const params = createBaseParams({ currentState: state, getCurrentState });
    const { rerender } = renderHook((props) => usePersistedSync(props), { initialProps: params });
    rerender({ ...params });
    expect(getCurrentState).not.toHaveBeenCalled();
    act(() => window.dispatchEvent(new Event('pagehide')));
    expect(getCurrentState).toHaveBeenCalledOnce();
  });

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('未水合时不保存', () => {
    const saveState = vi.fn();
    renderHook(() => usePersistedSync(createBaseParams({ hydrated: false, saveState })));

    act(() => vi.advanceTimersByTime(1000));

    expect(saveState).not.toHaveBeenCalled();
  });

  it('没有打开标签页时不保存', () => {
    const saveState = vi.fn();
    const applyPersistedState = vi.fn();
    renderHook(() =>
      usePersistedSync(
        createBaseParams({
          enabled: false,
          persistedState: createState('remote'),
          saveState,
          applyPersistedState,
        }),
      ),
    );

    act(() => vi.advanceTimersByTime(1000));

    expect(saveState).not.toHaveBeenCalled();
    expect(applyPersistedState).not.toHaveBeenCalled();
  });

  it('立即保存当前编辑态，不等待网络批量发送', () => {
    const saveState = vi.fn();
    const currentState = createState('users');
    renderHook(() => usePersistedSync(createBaseParams({ currentState, saveState })));

    expect(saveState).toHaveBeenCalledOnce();
    expect(saveState).toHaveBeenCalledWith({
      state: currentState,
      source: { kind: 'draft', draftId: 'default' },
    });
  });

  it('立即保存每次编辑且跳过内容相同的重渲染', () => {
    const saveState = vi.fn();
    const firstState = createState('first');
    const secondState = createState('second');
    const { rerender } = renderHook((params: PersistedSyncParams) => usePersistedSync(params), {
      initialProps: createBaseParams({ currentState: firstState, saveState }),
    });

    expect(saveState).toHaveBeenCalledWith({
      state: firstState,
      source: { kind: 'draft', draftId: 'default' },
    });
    rerender(createBaseParams({ currentState: secondState, saveState }));
    rerender(createBaseParams({ currentState: { ...secondState }, saveState }));
    expect(saveState).toHaveBeenCalledTimes(2);
    expect(saveState).toHaveBeenCalledWith({
      state: secondState,
      source: { kind: 'draft', draftId: 'default' },
    });
  });

  it('编辑器会话变化也会保存', () => {
    const saveState = vi.fn();
    const firstState = createState('users');
    const secondState = {
      ...firstState,
      sqlFormatMode: 'aligned' as const,
      addCount: 25,
      fieldTableViewConfig: { freezeEnabled: true, freezeColumns: 2 },
    };
    const { rerender } = renderHook((params: PersistedSyncParams) => usePersistedSync(params), {
      initialProps: createBaseParams({ currentState: firstState, saveState }),
    });

    rerender(createBaseParams({ currentState: secondState, saveState }));

    expect(saveState).toHaveBeenCalledTimes(2);
    expect(saveState).toHaveBeenLastCalledWith({
      state: secondState,
      source: { kind: 'draft', draftId: 'default' },
    });
  });

  it('页面退出时读取编辑器的最新快照', () => {
    const saveState = vi.fn();
    let latestState = createState('rendered');
    renderHook(() =>
      usePersistedSync(
        createBaseParams({
          currentState: latestState,
          getCurrentState: () => latestState,
          saveState,
        }),
      ),
    );
    latestState = createState('latest');

    act(() => window.dispatchEvent(new Event('pagehide')));

    expect(saveState).toHaveBeenCalledWith({
      state: latestState,
      source: { kind: 'draft', draftId: 'default' },
    });
  });

  it('离线编辑采用相同的即时保存路径', () => {
    const onlineSpy = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(true);
    const saveState = vi.fn();
    const { rerender } = renderHook((params: PersistedSyncParams) => usePersistedSync(params), {
      initialProps: createBaseParams({ currentState: createState('first'), saveState }),
    });

    saveState.mockClear();
    onlineSpy.mockReturnValue(false);
    act(() => window.dispatchEvent(new Event('offline')));
    rerender(createBaseParams({ currentState: createState('second'), saveState }));

    expect(saveState).toHaveBeenCalledWith({
      state: createState('second'),
      source: { kind: 'draft', draftId: 'default' },
    });
    act(() => vi.advanceTimersByTime(500));
    expect(saveState).toHaveBeenCalledOnce();
    onlineSpy.mockRestore();
  });

  it('远端状态尚未反映到编辑态时不回写旧值', () => {
    const saveState = vi.fn();
    renderHook(() =>
      usePersistedSync(
        createBaseParams({
          persistedState: createState('remote'),
          currentState: createState('stale'),
          saveState,
        }),
      ),
    );

    act(() => vi.advanceTimersByTime(500));

    expect(saveState).not.toHaveBeenCalled();
  });

  it('远端状态应用完成后的首个本地编辑会保存', () => {
    const saveState = vi.fn();
    const persistedState = createState('remote');
    let latestState = createState('stale');
    const baseParams = createBaseParams({
      persistedState,
      currentState: latestState,
      getCurrentState: () => latestState,
      saveState,
    });
    const { rerender } = renderHook((params: PersistedSyncParams) => usePersistedSync(params), {
      initialProps: baseParams,
    });

    latestState = persistedState;
    rerender({ ...baseParams, currentState: latestState });
    latestState = createState('local_edit');
    rerender({ ...baseParams, currentState: latestState });
    act(() => vi.advanceTimersByTime(500));

    expect(saveState).toHaveBeenCalledOnce();
    expect(saveState).toHaveBeenCalledWith({
      state: createState('local_edit'),
      source: { kind: 'draft', draftId: 'default' },
    });
  });

  it('保存表根据当前值和基线计算 dirty', () => {
    const saveState = vi.fn();
    const baseState = createState('users');
    const currentState = createState('users_v2');
    const activeSource: WorkspaceSelection = {
      kind: 'saved_table',
      normalizedName: 'users',
      tableName: 'Users',
      baseSignature: buildSchemaStateSignature(baseState),
    };
    renderHook(() => usePersistedSync(createBaseParams({ activeSource, currentState, saveState })));

    act(() => vi.advanceTimersByTime(500));

    expect(saveState).toHaveBeenCalledWith({
      state: currentState,
      source: activeSource,
    });
  });

  it('保存表只补齐 UI 默认值时保持 clean', () => {
    const saveState = vi.fn();
    const baseState = createState('users');
    const currentState: PersistedState = {
      ...baseState,
      objectType: 'table',
      viewDefinition: '',
      viewCreateOrReplace: true,
      foreignKeys: [],
      mysqlPartitionConfig: {
        enabled: false,
        type: 'RANGE',
        columns: [],
        partitionCount: 4,
        partitions: [],
      },
      tableMiscConfig: {
        enabled: false,
        engine: '',
        charset: '',
        collation: '',
        tablespace: '',
      },
      fieldTableViewConfig: { freezeEnabled: false, freezeColumns: 3 },
    };
    const activeSource: WorkspaceSelection = {
      kind: 'saved_table',
      normalizedName: 'users',
      tableName: 'Users',
      baseSignature: buildSchemaStateSignature(baseState),
    };
    renderHook(() => usePersistedSync(createBaseParams({ activeSource, currentState, saveState })));

    act(() => vi.advanceTimersByTime(500));

    expect(saveState).toHaveBeenCalledWith({
      state: currentState,
      source: activeSource,
    });
  });

  it('基线更新后用同一编辑态写入 clean 状态', () => {
    const saveState = vi.fn();
    const currentState = createState('users_v2');
    const dirtySource: WorkspaceSelection = {
      kind: 'saved_table',
      normalizedName: 'users',
      tableName: 'Users',
      baseSignature: buildSchemaStateSignature(createState('users')),
    };
    const cleanSource: WorkspaceSelection = {
      ...dirtySource,
      baseSignature: buildSchemaStateSignature(currentState),
    };
    const { rerender } = renderHook((params: PersistedSyncParams) => usePersistedSync(params), {
      initialProps: createBaseParams({ activeSource: dirtySource, currentState, saveState }),
    });
    act(() => vi.advanceTimersByTime(500));

    rerender(createBaseParams({ activeSource: cleanSource, currentState, saveState }));
    act(() => vi.advanceTimersByTime(500));

    expect(saveState).toHaveBeenLastCalledWith({
      state: currentState,
      source: cleanSource,
    });
  });

  it('水合状态通过统一入口应用', () => {
    const applyPersistedState = vi.fn();
    const persistedState = createState('test_table');

    renderHook(() => usePersistedSync(createBaseParams({ applyPersistedState, persistedState })));

    expect(applyPersistedState).toHaveBeenCalledOnce();
    expect(applyPersistedState).toHaveBeenCalledWith(persistedState);
  });
});
