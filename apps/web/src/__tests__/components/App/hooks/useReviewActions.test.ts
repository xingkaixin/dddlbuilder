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

function renderReview({
  loadedTableId = 'A',
  loadedTableNormalizedName = 'A',
  draftId,
}: {
  loadedTableId?: string | null;
  loadedTableNormalizedName?: string | null;
  draftId?: string;
} = {}) {
  const { wrapper } = createQueryClientWrapper();
  let currentDocumentKey = 'A-v1';
  const hook = renderHook(
    ({ documentKey, ddl }) =>
      useReviewActions({
        documentKey,
        getCurrentDocumentKey: () => currentDocumentKey,
        dbType: 'mysql',
        tableName: 'A',
        generatedSql: ddl,
        workspaceScope: scope,
        loadedTableId,
        draftId,
        loadedTableNormalizedName,
        setIsReviewHistoryOpen: vi.fn(),
      }),
    { wrapper, initialProps: { documentKey: 'A-v1', ddl: 'ddl-v1' } },
  );
  return {
    ...hook,
    rerender: (props: { documentKey: string; ddl: string }) => {
      currentDocumentKey = props.documentKey;
      hook.rerender(props);
    },
    setCurrentDocumentKey: (value: string) => {
      currentDocumentKey = value;
    },
  };
}

beforeEach(() => vi.clearAllMocks());

describe('review request ownership', () => {
  it('cancels the request and skips history after an edit', async () => {
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
    const signal = vi.mocked(requestDDLReview).mock.calls[0][1].signal;
    rerender({ documentKey: 'A-v2', ddl: 'ddl-v2' });
    expect(signal.aborted).toBe(true);
    await act(async () => {
      complete(review);
    });
    expect(saveReview).not.toHaveBeenCalled();
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

  it('does not persist a late draft review after the same tab is saved', async () => {
    let complete!: (value: typeof review) => void;
    vi.mocked(requestDDLReview).mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const hook = renderReview({
      loadedTableId: null,
      loadedTableNormalizedName: null,
      draftId: 'active-draft-id',
    });
    expect(hook.result.current.reviewTarget?.tableId).toBeUndefined();
    expect(hook.result.current.reviewTarget?.draftId).toBe('active-draft-id');
    act(() => {
      void hook.result.current.handleStartReview();
    });
    await waitFor(() => expect(hook.result.current.reviewState.isLoading).toBe(true));
    hook.setCurrentDocumentKey('A-saved-table-id');
    await act(async () => {
      complete(review);
    });
    expect(saveReview).not.toHaveBeenCalled();
  });
});
