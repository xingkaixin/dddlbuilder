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
});
