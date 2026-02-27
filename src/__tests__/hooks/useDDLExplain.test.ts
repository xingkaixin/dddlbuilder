import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDDLExplain } from '@/hooks/useDDLExplain';
import { LocaleProvider, useLocale } from '@/i18n/LocaleContext';

const streamingMocks = vi.hoisted(() => ({
  readTextStream: vi.fn(),
}));

vi.mock('@/services/streamingText', () => ({
  readTextStream: streamingMocks.readTextStream,
}));

function createAbortError() {
  const err = new Error('aborted');
  err.name = 'AbortError';
  return err;
}

function renderDDLExplainHook() {
  function Wrapper({ children }: PropsWithChildren) {
    return createElement(LocaleProvider, null, children);
  }

  return renderHook(() => useDDLExplain(), { wrapper: Wrapper });
}

function renderDDLExplainWithLocaleHook() {
  function Wrapper({ children }: PropsWithChildren) {
    return createElement(LocaleProvider, null, children);
  }

  return renderHook(
    () => ({
      explain: useDDLExplain(),
      locale: useLocale(),
    }),
    { wrapper: Wrapper },
  );
}

describe('useDDLExplain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should set error when sql is empty', async () => {
    const { result } = renderDDLExplainHook();

    await act(async () => {
      await result.current.startExplain('   ');
    });

    expect(result.current.error).toBe('未选中有效的 SQL 内容');
    expect(result.current.isLoading).toBe(false);
  });

  it('should stream explanation and complete successfully', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      body: new ReadableStream(),
      json: vi.fn(),
    } as unknown as Response);

    streamingMocks.readTextStream.mockImplementation(async (_, options) => {
      options?.onUpdate?.('partial explanation');
      return 'full explanation';
    });

    const { result } = renderDDLExplainHook();

    await act(async () => {
      await result.current.startExplain('SELECT 1', 'ctx');
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/explain',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          sql: 'SELECT 1',
          context: 'ctx',
          locale: 'zh-CN',
        }),
      }),
    );
    expect(streamingMocks.readTextStream).toHaveBeenCalledTimes(1);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.isComplete).toBe(true);
    expect(result.current.explanation).toBe('full explanation');
    expect(result.current.error).toBeNull();
  });

  it('should send the current locale after switching language', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      body: new ReadableStream(),
      json: vi.fn(),
    } as unknown as Response);

    streamingMocks.readTextStream.mockResolvedValue('english explanation');

    const { result } = renderDDLExplainWithLocaleHook();

    act(() => {
      result.current.locale.setLocale('en-US');
    });

    await waitFor(() => {
      expect(result.current.locale.resolvedLocale).toBe('en-US');
    });

    await act(async () => {
      await result.current.explain.startExplain('SELECT 1');
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/explain',
      expect.objectContaining({
        body: JSON.stringify({
          sql: 'SELECT 1',
          context: undefined,
          locale: 'en-US',
        }),
      }),
    );
  });

  it('should handle non-ok response with server error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn().mockResolvedValue({ error: '服务异常' }),
    } as unknown as Response);

    const { result } = renderDDLExplainHook();

    await act(async () => {
      await result.current.startExplain('SELECT 1');
    });

    expect(result.current.error).toBe('服务异常');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.explanation).toBeNull();
  });

  it('should fallback to status error when parsing error response fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 502,
      json: vi.fn().mockRejectedValue(new Error('invalid json')),
    } as unknown as Response);

    const { result } = renderDDLExplainHook();

    await act(async () => {
      await result.current.startExplain('SELECT 1');
    });

    expect(result.current.error).toBe('请求失败: 502');
    expect(result.current.isLoading).toBe(false);
  });

  it('should handle missing response body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      body: null,
      json: vi.fn(),
    } as unknown as Response);

    const { result } = renderDDLExplainHook();

    await act(async () => {
      await result.current.startExplain('SELECT 1');
    });

    expect(result.current.error).toBe('无法读取响应流');
    expect(result.current.isComplete).toBe(false);
  });

  it('should abort previous request when starting a new one', async () => {
    let firstSignal: AbortSignal | undefined;
    let requestCount = 0;

    vi.spyOn(globalThis, 'fetch').mockImplementation((_, init) => {
      requestCount += 1;
      const signal = init?.signal as AbortSignal | undefined;
      if (requestCount === 1) {
        firstSignal = signal;
        return new Promise<Response>((_, reject) => {
          signal?.addEventListener('abort', () => {
            reject(createAbortError());
          });
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        body: new ReadableStream(),
        json: vi.fn(),
      } as unknown as Response);
    });

    streamingMocks.readTextStream.mockResolvedValue('second explanation');

    const { result } = renderDDLExplainHook();

    act(() => {
      void result.current.startExplain('first sql');
    });
    await waitFor(() => {
      expect(result.current.isLoading).toBe(true);
    });

    await act(async () => {
      await result.current.startExplain('second sql');
    });

    expect(firstSignal?.aborted).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.isComplete).toBe(true);
    expect(result.current.explanation).toBe('second explanation');
  });

  it('should clear state and abort active request', async () => {
    let currentSignal: AbortSignal | undefined;

    vi.spyOn(globalThis, 'fetch').mockImplementation((_, init) => {
      currentSignal = init?.signal as AbortSignal | undefined;
      return new Promise<Response>(() => {});
    });

    const { result } = renderDDLExplainHook();

    act(() => {
      void result.current.startExplain('long running sql');
    });
    await waitFor(() => {
      expect(result.current.isLoading).toBe(true);
    });

    act(() => {
      result.current.clearExplain();
    });

    expect(currentSignal?.aborted).toBe(true);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.isComplete).toBe(false);
    expect(result.current.explanation).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
