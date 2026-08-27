import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useReviewActions } from '@/components/App/hooks/useReviewActions';
import { requestDDLReview } from '@/services/reviewService';
import { saveReview } from '@/utils/reviewHistory';
import { createQueryClientWrapper } from '@/__tests__/utils/queryClient';

vi.mock('@/services/reviewService', () => ({ requestDDLReview: vi.fn() }));
vi.mock('@/utils/reviewHistory', () => ({ saveReview: vi.fn().mockResolvedValue({}) }));
vi.mock('@/hooks/useAIRequestAccess', () => ({
  useAIRequestAccess: () => ({
    getAccessError: () => null,
    refreshCreditsAfterSuccess: vi.fn(),
    resolveRequestError: (error: Error) => error.message,
  }),
}));

const review = { score: 8, summary: 'review A', suggestions: [] };
const scope = { kind: 'anonymous' } as const;

function renderReview() {
  const { wrapper } = createQueryClientWrapper();
  return renderHook(
    ({ documentKey, ddl }) =>
      useReviewActions({
        documentKey,
        dbType: 'mysql',
        tableName: 'A',
        generatedSql: ddl,
        workspaceScope: scope,
        loadedTableId: 'A',
        loadedTableNormalizedName: 'A',
        setIsReviewHistoryOpen: vi.fn(),
      }),
    { wrapper, initialProps: { documentKey: 'A-v1', ddl: 'ddl-v1' } },
  );
}

beforeEach(() => vi.clearAllMocks());

describe('review request ownership', () => {
  it('keeps the original DDL in history and hides results after an edit', async () => {
    let complete!: (value: typeof review) => void;
    vi.mocked(requestDDLReview).mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const { result, rerender } = renderReview();
    act(() => {
      void result.current.handleStartReview();
    });
    await waitFor(() => expect(requestDDLReview).toHaveBeenCalledOnce());
    rerender({ documentKey: 'A-v2', ddl: 'ddl-v2' });
    await act(async () => {
      complete(review);
    });
    await waitFor(() => expect(saveReview).toHaveBeenCalledOnce());
    expect(vi.mocked(saveReview).mock.calls[0][2]).toBe('ddl-v1');
    expect(result.current.reviewState.result).toBeNull();
    expect(result.current.reviewState.isLoading).toBe(false);
  });

  it('ignores late streaming and success from superseded requests', async () => {
    let complete!: (value: typeof review) => void;
    vi.mocked(requestDDLReview)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            complete = resolve;
          }),
      )
      .mockResolvedValueOnce({ ...review, summary: 'new review' });
    const { result, rerender } = renderReview();
    act(() => {
      void result.current.handleStartReview();
    });
    await waitFor(() => expect(requestDDLReview).toHaveBeenCalledOnce());
    const oldOptions = vi.mocked(requestDDLReview).mock.calls[0][1];
    rerender({ documentKey: 'B-v1', ddl: 'ddl-B' });
    await act(async () => {
      await result.current.handleStartReview();
    });
    await act(async () => {
      oldOptions.onStreamingText?.('old stream');
      complete(review);
    });
    expect(oldOptions.signal.aborted).toBe(true);
    expect(result.current.reviewState.result?.summary).toBe('new review');
    expect(result.current.reviewState.streamingText).toBe('');
    expect(saveReview).toHaveBeenCalledOnce();
  });

  it('does not resurrect a cleared review when the transport finishes late', async () => {
    let complete!: (value: typeof review) => void;
    vi.mocked(requestDDLReview).mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const { result } = renderReview();
    act(() => {
      void result.current.handleStartReview();
    });
    await waitFor(() => expect(requestDDLReview).toHaveBeenCalledOnce());
    act(() => result.current.reviewState.clearReview());
    await act(async () => {
      complete(review);
    });
    expect(result.current.reviewState.result).toBeNull();
    expect(saveReview).not.toHaveBeenCalled();
  });

  it('advances the document key only for an applied review change', async () => {
    vi.mocked(requestDDLReview).mockResolvedValue(review);
    const { result, rerender } = renderReview();
    await act(async () => {
      await result.current.handleStartReview();
    });
    act(() =>
      result.current.reviewState.setReviewResult({ ...review, summary: 'applied' }, 'A-v2'),
    );
    rerender({ documentKey: 'A-v2', ddl: 'ddl-v2' });
    expect(result.current.reviewState.result?.summary).toBe('applied');
    rerender({ documentKey: 'B-v2', ddl: 'ddl-v2' });
    expect(result.current.reviewState.result).toBeNull();
    expect(saveReview).toHaveBeenCalledOnce();
  });
  it('saves a completed review to its original table after switching documents', async () => {
    let complete!: (value: typeof review) => void;
    vi.mocked(requestDDLReview).mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const { wrapper } = createQueryClientWrapper();
    const { result, rerender } = renderHook(
      ({ name }) => {
        const actions = useReviewActions({
          documentKey: name,
          dbType: 'mysql',
          tableName: name,
          generatedSql: `ddl-${name}`,
          workspaceScope: scope,
          loadedTableId: name,
          loadedTableNormalizedName: name,
          setIsReviewHistoryOpen: vi.fn(),
        });
        return actions;
      },
      { wrapper, initialProps: { name: 'A' } },
    );
    act(() => {
      void result.current.handleStartReview();
    });
    await waitFor(() => expect(result.current.reviewState.isLoading).toBe(true));
    rerender({ name: 'B' });
    await act(async () => {
      complete(review);
    });
    await waitFor(() => expect(saveReview).toHaveBeenCalledOnce());
    expect(saveReview).toHaveBeenCalledWith(
      { scope, tableId: 'A', normalizedName: 'A' },
      'A',
      'ddl-A',
      'mysql',
      review,
    );
    expect(result.current.reviewState.result).toBeNull();
  });
});
