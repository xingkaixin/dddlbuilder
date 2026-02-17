import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { usePersistedState } from '@/hooks';
import { createQueryClientWrapper } from '@/__tests__/utils/queryClient';
import { STORAGE_KEY } from '@/utils/constants';
import { getShareState, ShareApiError } from '@/services/shareService';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] || null),
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

vi.mock('@/services/shareService', () => ({
  getShareState: vi.fn(),
  ShareApiError: class ShareApiError extends Error {
    code?: string;
    status: number;

    constructor(message: string, status: number, code?: string) {
      super(message);
      this.name = 'ShareApiError';
      this.status = status;
      this.code = code;
    }
  },
}));

const mockedGetShareState = vi.mocked(getShareState);

const VALID_SHARE_ID = '8c6afce1-2a39-47aa-a14f-f3450c3ad7dd';
const SHARE_STORAGE_KEY = `${STORAGE_KEY}:share:${VALID_SHARE_ID}`;

describe('usePersistedState', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('应从主存储恢复状态', () => {
    const savedState = { tableName: 'users' };
    localStorageMock.setItem(STORAGE_KEY, JSON.stringify(savedState));

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => usePersistedState(), { wrapper });

    expect(result.current.hydrated).toBe(true);
    expect(result.current.persistedState).toEqual(savedState);
    expect(result.current.shareLoadStatus).toBe('idle');
    expect(result.current.isShareView).toBe(false);
  });

  it('应保存状态到主存储', () => {
    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => usePersistedState(), { wrapper });
    const testState = { tableName: 'orders' };

    act(() => {
      result.current.saveState(testState);
    });

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      STORAGE_KEY,
      JSON.stringify(testState),
    );
  });

  it('应清理主存储状态', () => {
    localStorageMock.setItem(STORAGE_KEY, JSON.stringify({ tableName: 'tmp' }));
    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => usePersistedState(), { wrapper });

    act(() => {
      result.current.clearState();
    });

    expect(localStorageMock.removeItem).toHaveBeenCalledWith(STORAGE_KEY);
    expect(result.current.persistedState).toBeNull();
  });

  it('应在分享路径加载远端状态并写入分享存储', async () => {
    const sharedState = {
      tableName: 'from_share',
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
    mockedGetShareState.mockResolvedValue(sharedState as any);
    window.history.replaceState({}, '', `/share/${VALID_SHARE_ID}`);

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => usePersistedState(), { wrapper });

    await waitFor(() => {
      expect(result.current.hydrated).toBe(true);
      expect(result.current.persistedState).toEqual(sharedState);
      expect(result.current.isShareView).toBe(true);
    });

    expect(mockedGetShareState).toHaveBeenCalledWith(VALID_SHARE_ID);
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      SHARE_STORAGE_KEY,
      JSON.stringify(sharedState),
    );
  });

  it('分享路径保存应写入分享存储而不是主存储', async () => {
    const sharedState = {
      tableName: 'from_share',
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
    mockedGetShareState.mockResolvedValue(sharedState as any);
    window.history.replaceState({}, '', `/share/${VALID_SHARE_ID}`);

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => usePersistedState(), { wrapper });

    await waitFor(() => {
      expect(result.current.hydrated).toBe(true);
    });

    const nextState = { ...sharedState, tableName: 'edited_share' };
    act(() => {
      result.current.saveState(nextState);
    });

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      SHARE_STORAGE_KEY,
      JSON.stringify(nextState),
    );
    expect(localStorageMock.setItem).not.toHaveBeenCalledWith(
      STORAGE_KEY,
      JSON.stringify(nextState),
    );
  });

  it('当分享不存在时应回跳首页并回退主存储', async () => {
    const mainState = { tableName: 'local_draft' };
    localStorageMock.setItem(STORAGE_KEY, JSON.stringify(mainState));
    mockedGetShareState.mockRejectedValue(
      new ShareApiError('Share not found', 404, 'SHARE_NOT_FOUND'),
    );
    window.history.replaceState({}, '', `/share/${VALID_SHARE_ID}`);

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => usePersistedState(), { wrapper });

    await waitFor(() => {
      expect(result.current.hydrated).toBe(true);
      expect(result.current.shareLoadStatus).toBe('not_found');
      expect(result.current.persistedState).toEqual(mainState);
      expect(result.current.isShareView).toBe(false);
    });

    expect(window.location.pathname).toBe('/');
  });

  it('当分享路径非法时应回跳首页并标记错误状态', async () => {
    const mainState = { tableName: 'local_draft' };
    localStorageMock.setItem(STORAGE_KEY, JSON.stringify(mainState));
    window.history.replaceState({}, '', '/share/not-a-uuid');

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => usePersistedState(), { wrapper });

    await waitFor(() => {
      expect(result.current.hydrated).toBe(true);
      expect(result.current.shareLoadStatus).toBe('error');
      expect(result.current.persistedState).toEqual(mainState);
      expect(result.current.isShareView).toBe(false);
    });

    expect(window.location.pathname).toBe('/');
    expect(mockedGetShareState).not.toHaveBeenCalled();
  });
});
