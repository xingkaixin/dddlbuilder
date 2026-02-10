import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersistedState } from '@/types';
import { usePersistedSync } from '@/components/App/hooks/usePersistedSync';

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
  saveState?: (state: PersistedState) => void;
}) {
  return {
    hydrated: overrides?.hydrated ?? true,
    persistedState: overrides?.persistedState ?? null,
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
    expect(saveState).toHaveBeenCalledWith(payload);
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
    expect(saveState).toHaveBeenCalledWith(secondPayload);
    expect(firstBuild).not.toHaveBeenCalled();
    expect(secondBuild).toHaveBeenCalledTimes(1);
  });
});
