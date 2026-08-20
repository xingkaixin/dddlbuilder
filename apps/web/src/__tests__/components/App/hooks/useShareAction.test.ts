import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useShareAction } from '@/components/App/hooks/useShareAction';
import { ShareApiError, createShare } from '@/services/shareService';
import { reportError } from '@/utils/errorReporter';

vi.mock('@/services/shareService', () => ({
  createShare: vi.fn(),
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

vi.mock('@/utils/errorReporter', () => ({
  reportError: vi.fn(),
}));

const mockedCreateShare = vi.mocked(createShare);
const mockedReportError = vi.mocked(reportError);

const SHARE_LINK_CACHE_KEY = 'ddlbuilder:share:last:v1';

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

const buildPersistedState = () => ({
  schemaName: '',
  tableName: 'users',
  tableComment: '用户表',
  dbType: 'mysql' as const,
  rows: [],
  addCount: 10,
  indexInput: '',
  currentIndexFields: [],
  indexes: [],
  authInput: '',
  authObjects: [],
});

const createShareResponse = () => ({
  id: 'id-1',
  url: 'https://example.com/share/id-1',
  expiresInSeconds: 604800,
});

describe('useShareAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
  });

  it('首次分享应创建链接并缓存', async () => {
    mockedCreateShare.mockResolvedValue(createShareResponse());
    const showToast = vi.fn();

    const { result } = renderHook(() =>
      useShareAction({
        buildPersistedState,
        showToast,
      }),
    );

    await act(async () => {
      await result.current.handleShare();
    });

    expect(mockedCreateShare).toHaveBeenCalledTimes(1);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://example.com/share/id-1');
    expect(localStorage.setItem).toHaveBeenCalledWith(SHARE_LINK_CACHE_KEY, expect.any(String));
    expect(showToast).toHaveBeenCalledWith('链接已复制到剪贴板（7天后失效）');
  });

  it('分享执行期间应暴露 loading 状态并在结束后恢复', async () => {
    let resolveCreateShare: ((value: ReturnType<typeof createShareResponse>) => void) | null = null;
    mockedCreateShare.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreateShare = resolve;
        }),
    );
    const showToast = vi.fn();

    const { result } = renderHook(() =>
      useShareAction({
        buildPersistedState,
        showToast,
      }),
    );

    let sharePromise: Promise<void> | null = null;
    act(() => {
      sharePromise = result.current.handleShare();
    });

    expect(result.current.isSharing).toBe(true);

    await act(async () => {
      resolveCreateShare?.(createShareResponse());
      await sharePromise;
    });

    expect(result.current.isSharing).toBe(false);
  });

  it('并发触发分享时应防重入，只发送一次请求', async () => {
    let resolveCreateShare: ((value: ReturnType<typeof createShareResponse>) => void) | null = null;
    mockedCreateShare.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreateShare = resolve;
        }),
    );
    const showToast = vi.fn();

    const { result } = renderHook(() =>
      useShareAction({
        buildPersistedState,
        showToast,
      }),
    );

    let firstSharePromise: Promise<void> | null = null;
    let secondSharePromise: Promise<void> | null = null;
    act(() => {
      firstSharePromise = result.current.handleShare();
      secondSharePromise = result.current.handleShare();
    });

    expect(mockedCreateShare).toHaveBeenCalledTimes(1);
    expect(result.current.isSharing).toBe(true);

    await act(async () => {
      resolveCreateShare?.(createShareResponse());
      await Promise.all([firstSharePromise, secondSharePromise]);
    });

    expect(result.current.isSharing).toBe(false);
    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
  });

  it('状态未变化且缓存未过期时应复用链接', async () => {
    mockedCreateShare.mockResolvedValue(createShareResponse());
    const showToast = vi.fn();

    const { result } = renderHook(() =>
      useShareAction({
        buildPersistedState,
        showToast,
      }),
    );

    await act(async () => {
      await result.current.handleShare();
    });
    await act(async () => {
      await result.current.handleShare();
    });

    expect(mockedCreateShare).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenNthCalledWith(2, '链接已复制到剪贴板（复用已有链接，7天后失效）');
  });

  it('redis 未配置时应提示用户配置环境变量', async () => {
    mockedCreateShare.mockRejectedValue(
      new ShareApiError('Redis config missing', 500, 'REDIS_CONFIG_MISSING'),
    );
    const showToast = vi.fn();

    const { result } = renderHook(() =>
      useShareAction({
        buildPersistedState,
        showToast,
      }),
    );

    await act(async () => {
      await result.current.handleShare();
    });

    expect(mockedReportError).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith('分享功能未配置完成，请先配置 Redis 环境变量');
  });
});
