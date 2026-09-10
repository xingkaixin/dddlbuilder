import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useDDLReview } from '@/hooks/useDDLReview';
import { flushPromises } from '@/__tests__/utils/test-utils';
import { createQueryClientWrapper } from '@/__tests__/utils/queryClient';
import { useLocale } from '@/i18n/LocaleContext';
import { createAITextStream as createStream } from '@/__tests__/utils/aiStream';
import { encodeAIStreamEvent } from '@ddlbuilder/shared-types';

// oxlint-disable-next-line anti-slop/no-module-mocking -- Supplies stable auth and credit context while this hook exercises the real fetch stream lifecycle.
vi.mock('@/auth/AuthSessionProvider', () => {
  const useAuthIdentity = () => ({
    status: 'signed_in',
    configured: true,
    userId: 'user-1',
    email: 'user@example.com',
    name: 'User One',
    emailVerified: true,
  });
  const useAuthCredits = () => ({
    creditBalance: 1000,
    creditsStatus: 'ready',
    refreshCredits: vi.fn(),
  });
  const useAuthDialog = () => ({
    authDialogOpen: false,
    openAuthDialog: vi.fn(),
    closeAuthDialog: vi.fn(),
  });

  return { useAuthIdentity, useAuthCredits, useAuthDialog };
});

function renderDDLReviewHook() {
  const { wrapper } = createQueryClientWrapper();

  return renderHook(() => useDDLReview('document'), { wrapper });
}

function renderDDLReviewWithLocaleHook() {
  const { wrapper } = createQueryClientWrapper();

  return renderHook(
    () => ({
      review: useDDLReview('document'),
      locale: useLocale(),
    }),
    { wrapper },
  );
}

const createResponse = (body: BodyInit | null, status = 200) => new Response(body, { status });

describe('useDDLReview', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return error when ddl is empty', async () => {
    const { result } = renderDDLReviewHook();

    await act(async () => {
      await result.current.startReview('', '', 'mysql');
    });

    expect(result.current.error).toBe('请先生成DDL语句');
  });

  it('should handle streaming review response', async () => {
    const { result } = renderDDLReviewHook();

    const stream = createStream(['{"score": 8,', '"summary": "ok", "suggestions": ["a", "b"]}']);

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(createResponse(stream));

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

  it('should send the current locale after switching language', async () => {
    const { result } = renderDDLReviewWithLocaleHook();

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        createResponse(createStream(['{"score": 8, "summary": "ok", "suggestions": []}'])),
      );

    act(() => {
      result.current.locale.setLocale('en-US');
    });

    await act(async () => {
      await flushPromises();
    });

    await act(async () => {
      await result.current.review.startReview('ddl', 'table', 'mysql');
      await flushPromises();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/review',
      expect.objectContaining({
        body: JSON.stringify({
          ddl: 'ddl',
          tableName: 'table',
          dbType: 'mysql',
          locale: 'en-US',
        }),
      }),
    );
  });

  it('should handle non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createResponse(JSON.stringify({ error: 'boom' }), 500),
    );

    const { result } = renderDDLReviewHook();

    await act(async () => {
      await result.current.startReview('ddl', 'table', 'mysql');
      await flushPromises();
    });

    expect(result.current.error).toBe('boom');
    expect(result.current.isLoading).toBe(false);
  });

  it('should handle streaming with partialResult during loading', async () => {
    const { result } = renderDDLReviewHook();

    const encoder = new TextEncoder();
    let controllerRef: ReadableStreamDefaultController | null = null;

    const stream = new ReadableStream({
      start(controller) {
        controllerRef = controller;
      },
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(createResponse(stream));

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
      controllerRef?.enqueue(
        encoder.encode(
          encodeAIStreamEvent({ type: 'delta', text: '{"score": 7, "summary": "good"' }),
        ),
      );
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
        encoder.encode(
          encodeAIStreamEvent({ type: 'delta', text: ', "suggestions": ["fix 1", "fix 2"]}' }),
        ),
      );
      controllerRef?.enqueue(encoder.encode(encodeAIStreamEvent({ type: 'done' })));
      controllerRef?.close();
    });

    await act(async () => {
      await flushPromises();
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.result?.score).toBe(7);
    expect(result.current.result?.suggestions).toEqual(['fix 1', 'fix 2']);
  });

  it('should handle request cancellation via clearReview during active request', async () => {
    const { result } = renderDDLReviewHook();

    const stream = new ReadableStream({
      start() {},
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(createResponse(stream));

    // Start a review
    act(() => {
      result.current.startReview('ddl', 'table', 'mysql');
    });

    // We do NOT flush promises here so that the request is still active
    // Cancel the review
    act(() => {
      result.current.clearReview();
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.result).toBe(null);
    expect(result.current.error).toBe(null);
  });

  it('should handle response parsing error', async () => {
    const { result } = renderDDLReviewHook();

    const stream = createStream(['invalid json response']);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(createResponse(stream));

    await act(async () => {
      await result.current.startReview('ddl', 'table', 'mysql');
      await flushPromises();
    });

    expect(result.current.error).toBe('无法解析评审结果');
    expect(result.current.isLoading).toBe(false);
  });

  it('should handle empty response body', async () => {
    const { result } = renderDDLReviewHook();

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(createResponse(null));

    await act(async () => {
      await result.current.startReview('ddl', 'table', 'mysql');
      await flushPromises();
    });

    expect(result.current.error).toBe('无法读取响应流');
    expect(result.current.isLoading).toBe(false);
  });

  it('should handle network error', async () => {
    const { result } = renderDDLReviewHook();

    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

    await act(async () => {
      await result.current.startReview('ddl', 'table', 'mysql');
      await flushPromises();
    });

    expect(result.current.error).toBe('Network error');
    expect(result.current.isLoading).toBe(false);
  });

  it('should handle abort error silently', async () => {
    const { result } = renderDDLReviewHook();

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
    const { result } = renderDDLReviewHook();
    let firstSignal: AbortSignal | undefined;
    let requestCount = 0;

    vi.spyOn(globalThis, 'fetch').mockImplementation((_, init) => {
      requestCount += 1;
      const signal = init?.signal ?? undefined;

      if (requestCount === 1) {
        firstSignal = signal;

        return new Promise<Response>((_, reject) => {
          signal?.addEventListener('abort', () => {
            const abortError = new Error('AbortError');
            abortError.name = 'AbortError';
            reject(abortError);
          });
        });
      }

      return Promise.resolve(
        createResponse(createStream(['{"score": 9, "summary": "second", "suggestions": []}'])),
      );
    });

    // Start first review
    await act(async () => {
      void result.current.startReview('ddl1', 'table1', 'mysql');
      await flushPromises();
    });

    // Start second review - should work without error
    await act(async () => {
      void result.current.startReview('ddl2', 'table2', 'mysql');
      await flushPromises();
    });

    expect(firstSignal?.aborted).toBe(true);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.result?.summary).toBe('second');
  });

  it('should handle performance_warning type suggestions', async () => {
    const { result } = renderDDLReviewHook();

    const mockResponse = JSON.stringify({
      score: 6,
      summary: 'Found some performance issues',
      suggestions: [
        {
          id: 'sug_1',
          description: 'VARCHAR(500) as primary key may impact performance',
          type: 'performance_warning',
          actionable: false,
          severity: 'warning',
        },
        {
          id: 'sug_2',
          description: 'TEXT column as primary key is not recommended',
          type: 'performance_warning',
          actionable: false,
          severity: 'error',
        },
      ],
    });

    const stream = createStream([mockResponse]);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(createResponse(stream));

    await act(async () => {
      await result.current.startReview('ddl', 'table', 'mysql');
      await flushPromises();
    });

    expect(result.current.result?.score).toBe(6);
    expect(result.current.result?.suggestions).toHaveLength(2);

    expect(result.current.result?.suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'performance_warning',
          severity: 'warning',
          actionable: false,
        }),
        expect.objectContaining({
          type: 'performance_warning',
          severity: 'error',
          actionable: false,
        }),
      ]),
    );
  });

  it('should execute a completed review again for the same params', async () => {
    const { result } = renderDDLReviewHook();

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () =>
        createResponse(createStream(['{"score": 9, "summary": "fresh", "suggestions": []}'])),
      );

    await act(async () => {
      await result.current.startReview('ddl', 'table', 'mysql');
      await flushPromises();
    });

    await act(async () => {
      await result.current.startReview('ddl', 'table', 'mysql');
      await flushPromises();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.result?.summary).toBe('fresh');
  });

  it('should ignore duplicate concurrent review requests', async () => {
    const { result } = renderDDLReviewHook();
    let fetchCount = 0;

    const stream = new ReadableStream({
      start() {
        // stream never finishes immediately
      },
    });

    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      fetchCount++;

      return Promise.resolve(createResponse(stream));
    });

    act(() => {
      result.current.startReview('ddl_dup', 'table', 'mysql');
    });

    act(() => {
      result.current.startReview('ddl_dup', 'table', 'mysql'); // Same params
    });

    await waitFor(() => expect(fetchCount).toBe(1));
  });

  it('should set review result directly', () => {
    const { result } = renderDDLReviewHook();

    act(() => {
      result.current.setReviewResult({
        score: 100,
        summary: 'perfect',
        suggestions: [],
      });
    });

    expect(result.current.result?.score).toBe(100);
    expect(result.current.result?.summary).toBe('perfect');
  });
});
