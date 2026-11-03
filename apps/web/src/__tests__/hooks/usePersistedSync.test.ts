import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { WorkspaceSavePayload, WorkspaceSelection } from '@ddlbuilder/shared-types/workspace';
import { usePersistedSync } from '@/components/App/hooks/usePersistedSync';

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
});
