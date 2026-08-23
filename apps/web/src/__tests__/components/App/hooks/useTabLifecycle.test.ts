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
        currentState: createState('active'),
        activeSource: { kind: 'draft', draftId: 'draft-b' },
        serializePersistedState: JSON.stringify,
        saveState: vi.fn(),
        selectWorkspaceSnapshot,
        resolveWorkspaceSnapshot,
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
        currentState: createState('placeholder'),
        activeSource: {
          kind: 'saved_table',
          normalizedName: 'loading',
          tableName: 'Loading',
          baseSignature: '',
        },
        serializePersistedState: JSON.stringify,
        saveState,
        selectWorkspaceSnapshot: vi.fn(),
        resolveWorkspaceSnapshot: () => null,
      }),
    );

    act(() => result.current.switchToTabById(targetTabId));

    expect(saveState).not.toHaveBeenCalled();
  });
});
