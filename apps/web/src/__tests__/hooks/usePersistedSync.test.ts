import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { usePersistedSync } from '@/components/App/hooks/usePersistedSync';
import type { WorkspaceSource } from '@ddlbuilder/shared-types/workspace';
import { serializePersistedStateForComparison } from '@/utils/persistedStateSignature';

function createState(name: string): PersistedState {
  return {
    schemaName: '',
    tableName: name,
    tableComment: '',
    dbType: 'mysql',
    sqlFormatMode: 'compact',
    rows: [],
    addCount: 10,
    indexInput: '',
    currentIndexFields: [],
    indexes: [],
    authInput: '',
    authObjects: [],
  };
}

function createBaseParams(overrides?: {
  hydrated?: boolean;
  persistedState?: PersistedState | null;
  buildPersistedState?: () => PersistedState;
  saveState?: (payload: {
    state: PersistedState;
    source: WorkspaceSource;
    isDirty: boolean;
  }) => void;
  activeSource?: WorkspaceSource;
}) {
  return {
    hydrated: overrides?.hydrated ?? true,
    hasOpenTab: true,
    persistedState: overrides?.persistedState ?? null,
    activeSource: overrides?.activeSource ?? { kind: 'draft', draftId: 'default' },
    saveState: overrides?.saveState ?? vi.fn(),
    buildPersistedState: overrides?.buildPersistedState ?? (() => createState('a')),
    applyPersistedState: vi.fn(),
  };
}

describe('usePersistedSync debounce save', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('hydrated 为 false 时不会保存', () => {
    const saveState = vi.fn();
    const params = createBaseParams({
      hydrated: false,
      saveState,
    });

    renderHook(() => usePersistedSync(params));

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(saveState).not.toHaveBeenCalled();
  });

  it('没有打开标签页时不会保存', () => {
    const saveState = vi.fn();
    const buildPersistedState = vi.fn(() => createState('ghost_draft'));
    const params = createBaseParams({
      saveState,
      buildPersistedState,
    });
    params.hasOpenTab = false;

    renderHook(() => usePersistedSync(params));

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(buildPersistedState).not.toHaveBeenCalled();
    expect(saveState).not.toHaveBeenCalled();
  });

  it('应在 500ms 后触发一次保存', () => {
    const saveState = vi.fn();
    const payload = createState('users');
    const buildPersistedState = vi.fn(() => payload);
    const params = createBaseParams({
      saveState,
      buildPersistedState,
    });

    renderHook(() => usePersistedSync(params));

    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(saveState).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(buildPersistedState).toHaveBeenCalledTimes(1);
    expect(saveState).toHaveBeenCalledTimes(1);
    expect(saveState).toHaveBeenCalledWith({
      state: payload,
      source: { kind: 'draft', draftId: 'default' },
      isDirty: false,
    });
  });

  it('依赖变化应重置防抖，仅保存最终状态', () => {
    const saveState = vi.fn();
    const firstPayload = createState('first');
    const secondPayload = createState('second');
    const firstBuild = vi.fn(() => firstPayload);
    const secondBuild = vi.fn(() => secondPayload);

    const { rerender } = renderHook(
      (params: ReturnType<typeof createBaseParams>) => usePersistedSync(params),
      {
        initialProps: createBaseParams({
          saveState,
          buildPersistedState: firstBuild,
        }),
      },
    );

    act(() => {
      vi.advanceTimersByTime(300);
    });

    rerender(
      createBaseParams({
        saveState,
        buildPersistedState: secondBuild,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(saveState).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(saveState).toHaveBeenCalledTimes(1);
    expect(saveState).toHaveBeenCalledWith({
      state: secondPayload,
      source: { kind: 'draft', draftId: 'default' },
      isDirty: false,
    });
    expect(firstBuild).not.toHaveBeenCalled();
    expect(secondBuild).toHaveBeenCalledTimes(1);
  });

  it('当前状态与 active tab 快照一致时仍应保存到工作区', () => {
    const saveState = vi.fn();
    const payload = createState('users');
    const params = createBaseParams({
      saveState,
      buildPersistedState: () => payload,
    });

    renderHook(() => usePersistedSync(params));

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(saveState).toHaveBeenCalledWith({
      state: payload,
      source: { kind: 'draft', draftId: 'default' },
      isDirty: false,
    });
  });

  it('恢复在线时应立即保存当前状态', () => {
    const saveState = vi.fn();
    const payload = createState('online_flush');
    const buildPersistedState = vi.fn(() => payload);
    const params = createBaseParams({
      saveState,
      buildPersistedState,
    });

    renderHook(() => usePersistedSync(params));

    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    expect(buildPersistedState).toHaveBeenCalledTimes(1);
    expect(saveState).toHaveBeenCalledWith({
      state: payload,
      source: { kind: 'draft', draftId: 'default' },
      isDirty: false,
    });
  });

  it('离线状态变化时应立即保存到本地同步源', () => {
    const onlineSpy = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(true);
    const saveState = vi.fn();
    const firstPayload = createState('offline_first');
    const secondPayload = createState('offline_second');
    const firstBuild = vi.fn(() => firstPayload);
    const secondBuild = vi.fn(() => secondPayload);

    const { rerender } = renderHook(
      (params: ReturnType<typeof createBaseParams>) => usePersistedSync(params),
      {
        initialProps: createBaseParams({
          saveState,
          buildPersistedState: firstBuild,
        }),
      },
    );
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    saveState.mockClear();

    rerender(
      createBaseParams({
        saveState,
        buildPersistedState: secondBuild,
      }),
    );

    expect(secondBuild).toHaveBeenCalledTimes(1);
    expect(saveState).toHaveBeenCalledWith({
      state: secondPayload,
      source: { kind: 'draft', draftId: 'default' },
      isDirty: false,
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(saveState).toHaveBeenCalledTimes(1);
    onlineSpy.mockRestore();
  });

  it('刚应用远端状态且 UI 仍未追上时应跳过本轮保存', () => {
    const saveState = vi.fn();
    const remoteState = createState('remote_state');
    const staleState = createState('stale_state');
    const params = createBaseParams({
      saveState,
      persistedState: remoteState,
      buildPersistedState: () => staleState,
    });

    renderHook(() => usePersistedSync(params));

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(saveState).not.toHaveBeenCalled();
  });

  it('远端状态已应用后首个本地编辑应保存', () => {
    const saveState = vi.fn();
    const remoteState = createState('remote_state');
    const localEditState = createState('local_edit');
    const remoteBuild = vi.fn(() => remoteState);
    const localEditBuild = vi.fn(() => localEditState);
    const params = createBaseParams({
      saveState,
      persistedState: remoteState,
      buildPersistedState: remoteBuild,
    });

    const { rerender } = renderHook(
      (params: ReturnType<typeof createBaseParams>) => usePersistedSync(params),
      {
        initialProps: params,
      },
    );

    rerender({
      ...params,
      buildPersistedState: localEditBuild,
    });

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(saveState).toHaveBeenCalledTimes(1);
    expect(saveState).toHaveBeenCalledWith({
      state: localEditState,
      source: { kind: 'draft', draftId: 'default' },
      isDirty: false,
    });
  });

  it('当来源为保存表时应计算 dirty 状态', () => {
    const saveState = vi.fn();
    const baseState = createState('users');
    const dirtyState = createState('users_v2');
    const params = createBaseParams({
      saveState,
      buildPersistedState: () => dirtyState,
      activeSource: {
        kind: 'saved_table',
        normalizedName: 'users',
        tableName: 'Users',
        baseSignature: JSON.stringify(baseState),
      },
    });

    renderHook(() => usePersistedSync(params));

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(saveState).toHaveBeenCalledWith({
      state: dirtyState,
      source: params.activeSource,
      isDirty: true,
    });
  });

  it('保存表只补齐 UI 默认值时应保持 clean', () => {
    const saveState = vi.fn();
    const baseState = createState('users');
    const currentState = {
      ...baseState,
      objectType: 'table' as const,
      viewDefinition: '',
      viewCreateOrReplace: true,
      foreignKeys: [],
      mysqlPartitionConfig: {
        enabled: false,
        type: 'RANGE' as const,
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
      fieldTableViewConfig: {
        freezeEnabled: false,
        freezeColumns: 3,
      },
    };
    const params = createBaseParams({
      saveState,
      buildPersistedState: () => currentState,
      activeSource: {
        kind: 'saved_table',
        normalizedName: 'users',
        tableName: 'Users',
        baseSignature: serializePersistedStateForComparison(baseState),
      },
    });

    renderHook(() => usePersistedSync(params));

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(saveState).toHaveBeenCalledWith({
      state: currentState,
      source: params.activeSource,
      isDirty: false,
    });
  });

  it('应使用当前内存工作区来源，不依赖 localStorage', () => {
    const saveState = vi.fn();
    const dirtyState = createState('users_v3');
    const params = createBaseParams({
      saveState,
      buildPersistedState: () => dirtyState,
      activeSource: {
        kind: 'saved_table',
        normalizedName: 'users',
        tableName: 'Users',
        baseSignature: JSON.stringify(createState('users')),
      },
    });

    renderHook(() => usePersistedSync(params));

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(saveState).toHaveBeenCalledWith({
      state: dirtyState,
      source: params.activeSource,
      isDirty: true,
    });
    expect(saveState).toHaveBeenCalledWith({
      state: dirtyState,
      source: params.activeSource,
      isDirty: true,
    });
  });

  it('保存时应使用 activeSource', () => {
    const saveState = vi.fn();
    const savedState = createState('saved_table_content');
    const source: WorkspaceSource = {
      kind: 'saved_table',
      normalizedName: 'users',
      tableName: 'Users',
      baseSignature: '{"table":"users"}',
    };

    const params = createBaseParams({
      saveState,
      activeSource: source,
      buildPersistedState: () => savedState,
    });

    renderHook(() => usePersistedSync(params));

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(saveState).toHaveBeenCalledWith({
      state: savedState,
      source: source,
      isDirty: true,
    });
  });
});

describe('usePersistedSync useEffect synchronization', () => {
  it('应在 hydrated 和 persistedState 都在时通过统一入口应用数据', () => {
    const applyPersistedState = vi.fn();
    const persistedState = createState('test_table');
    persistedState.tableComment = 'test comment';
    persistedState.dbType = 'postgresql';
    persistedState.addCount = 5;

    const params = createBaseParams({
      hydrated: true,
      persistedState,
    });
    params.applyPersistedState = applyPersistedState;

    renderHook(() => usePersistedSync(params));

    expect(applyPersistedState).toHaveBeenCalledOnce();
    expect(applyPersistedState).toHaveBeenCalledWith(persistedState);
  });
});
