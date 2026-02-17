import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersistedState } from '@/types';
import { usePersistedSync } from '@/components/App/hooks/usePersistedSync';
import type { WorkspaceSource } from '@/types/workspace';

function createState(name: string): PersistedState {
  return {
    tableName: name,
    tableComment: '',
    dbType: 'mysql',
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
  loadedTableNormalizedName?: string | null;
}) {
  return {
    hydrated: overrides?.hydrated ?? true,
    persistedState: overrides?.persistedState ?? null,
    activeSource: overrides?.activeSource ?? { kind: 'global_draft' },
    saveState: overrides?.saveState ?? vi.fn(),
    buildPersistedState:
      overrides?.buildPersistedState ?? (() => createState('a')),
    setTableName: vi.fn(),
    setTableComment: vi.fn(),
    setDbType: vi.fn(),
    setAddCount: vi.fn(),
    initializeRows: vi.fn(),
    initializeIndexState: vi.fn(),
    setFieldTableFreezeEnabled: vi.fn(),
    setFieldTableFreezeColumns: vi.fn(),
    defaultFieldTableFreezeColumns: 3,
    setLoadedTableNormalizedName: vi.fn(),
    setLoadedTableName: vi.fn(),
    setLoadedTableSignature: vi.fn(),
    loadedTableNormalizedName: overrides?.loadedTableNormalizedName ?? null,
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
      source: { kind: 'global_draft' },
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
      source: { kind: 'global_draft' },
      isDirty: false,
    });
    expect(firstBuild).not.toHaveBeenCalled();
    expect(secondBuild).toHaveBeenCalledTimes(1);
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
      loadedTableNormalizedName: 'users',
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
      loadedTableNormalizedName: 'users',
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

  it('应在 ActiveSource 与 LoadedName 不匹配时跳过保存（防止竞态条件）', () => {
    const saveState = vi.fn();
    const globalState = createState('global_draft');
    const savedState = createState('saved_table_content');

    // 模拟竞态条件：
    // Source 仍为 Global Draft (旧)，但 Store 已更新为 Saved Table (新数据 + 新Name)
    const params = createBaseParams({
      saveState,
      activeSource: { kind: 'global_draft' },
      buildPersistedState: () => savedState, // 构建出的 State 是 SavedTable 的内容
      loadedTableNormalizedName: 'users', // Store 认为当前加载的是 users 表
    });

    renderHook(() => usePersistedSync(params));

    act(() => {
      vi.advanceTimersByTime(500);
    });

    // 期望：因为 Source(Global) != LoadedName(users)，所以跳过保存
    expect(saveState).not.toHaveBeenCalled();
  });

  it('应在 ActiveSource 与 LoadedName 匹配时正常保存', () => {
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
      loadedTableNormalizedName: 'users', // 匹配
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
