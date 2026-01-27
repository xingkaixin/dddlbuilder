import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDDLReview } from '@/hooks/useDDLReview';
import { flushPromises } from '@/__tests__/utils/test-utils';

const createStream = (chunks: string[]) => {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => {
        controller.enqueue(encoder.encode(chunk));
      });
      controller.close();
    },
  });
};

describe('useDDLReview', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return error when ddl is empty', async () => {
    const { result } = renderHook(() => useDDLReview());

    await act(async () => {
      await result.current.startReview('', '', 'mysql');
    });

    expect(result.current.error).toBe('请先生成DDL语句');
  });

  it('should handle streaming review response', async () => {
    const { result } = renderHook(() => useDDLReview());

    const stream = createStream([
      '{"score": 8,',
      '"summary": "ok", "suggestions": ["a", "b"]}',
    ]);

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      body: stream,
      json: vi.fn(),
    } as unknown as Response);

    await act(async () => {
      await result.current.startReview('ddl', 'table', 'mysql');
      await flushPromises();
    });

    expect(fetchMock).toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBe(null);
    expect(result.current.result?.score).toBe(8);
    expect(result.current.result?.summary).toBe('ok');
    expect(result.current.result?.suggestions).toEqual(['a', 'b']);
  });

  it('should handle non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn().mockResolvedValue({ error: 'boom' }),
    } as unknown as Response);

    const { result } = renderHook(() => useDDLReview());

    await act(async () => {
      await result.current.startReview('ddl', 'table', 'mysql');
      await flushPromises();
    });

    expect(result.current.error).toBe('boom');
    expect(result.current.isLoading).toBe(false);
  });

  it('should handle streaming with partialResult during loading', async () => {
    const { result } = renderHook(() => useDDLReview());

    const encoder = new TextEncoder();
    let controllerRef: ReadableStreamDefaultController | null = null;

    const stream = new ReadableStream({
      start(controller) {
        controllerRef = controller;
      },
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      body: stream,
      json: vi.fn(),
    } as unknown as Response);

    // Start the review
    act(() => {
      result.current.startReview('ddl', 'table', 'mysql');
    });

    // Wait for loading state
    await act(async () => {
      await flushPromises();
    });

    expect(result.current.isLoading).toBe(true);

    // Send partial data
    act(() => {
      controllerRef?.enqueue(encoder.encode('{"score": 7, "summary": "good"'));
    });

    await act(async () => {
      await flushPromises();
    });

    // partialResult should be available during streaming
    expect(result.current.partialResult).not.toBeNull();
    expect(result.current.partialResult?.score).toBe(7);

    // Complete the stream
    act(() => {
      controllerRef?.enqueue(
        encoder.encode(', "suggestions": ["fix 1", "fix 2"]}'),
      );
      controllerRef?.close();
    });

    await act(async () => {
      await flushPromises();
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.result?.score).toBe(7);
    expect(result.current.result?.suggestions).toEqual(['fix 1', 'fix 2']);
  });

  it('should handle request cancellation via clearReview', async () => {
    const { result } = renderHook(() => useDDLReview());

    // Start a review
    act(() => {
      result.current.startReview('ddl', 'table', 'mysql');
    });

    await act(async () => {
      await flushPromises();
    });

    // Cancel the review
    act(() => {
      result.current.clearReview();
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.result).toBe(null);
    expect(result.current.error).toBe(null);
  });

  it('should handle response parsing error', async () => {
    const { result } = renderHook(() => useDDLReview());

    const stream = createStream(['invalid json response']);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      body: stream,
      json: vi.fn(),
    } as unknown as Response);

    await act(async () => {
      await result.current.startReview('ddl', 'table', 'mysql');
      await flushPromises();
    });

    expect(result.current.error).toBe('无法解析评审结果');
    expect(result.current.isLoading).toBe(false);
  });

  it('should handle empty response body', async () => {
    const { result } = renderHook(() => useDDLReview());

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      body: null,
      json: vi.fn(),
    } as unknown as Response);

    await act(async () => {
      await result.current.startReview('ddl', 'table', 'mysql');
      await flushPromises();
    });

    expect(result.current.error).toBe('无法读取响应流');
    expect(result.current.isLoading).toBe(false);
  });

  it('should handle network error', async () => {
    const { result } = renderHook(() => useDDLReview());

    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

    await act(async () => {
      await result.current.startReview('ddl', 'table', 'mysql');
      await flushPromises();
    });

    expect(result.current.error).toBe('Network error');
    expect(result.current.isLoading).toBe(false);
  });

  it('should handle abort error silently', async () => {
    const { result } = renderHook(() => useDDLReview());

    const abortError = new Error('AbortError');
    abortError.name = 'AbortError';

    vi.spyOn(globalThis, 'fetch').mockRejectedValue(abortError);

    await act(async () => {
      await result.current.startReview('ddl', 'table', 'mysql');
      await flushPromises();
    });

    // AbortError should not update error state
    expect(result.current.error).toBe(null);
  });

  it('should abort previous request when starting new review', async () => {
    const { result } = renderHook(() => useDDLReview());

    // Start first review
    act(() => {
      result.current.startReview('ddl1', 'table1', 'mysql');
    });

    await act(async () => {
      await flushPromises();
    });

    // Start second review - should work without error
    act(() => {
      result.current.startReview('ddl2', 'table2', 'mysql');
    });

    // The hook should handle aborting previous request internally
    expect(result.current.isLoading).toBe(true);
  });
});
