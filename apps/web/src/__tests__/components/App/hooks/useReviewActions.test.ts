import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useReviewActions } from '@/components/App/hooks/useReviewActions';
import { requestDDLReview } from '@/services/reviewService';
import { saveReview } from '@/utils/reviewHistory';
import { createQueryClientWrapper } from '@/__tests__/utils/queryClient';

// oxlint-disable-next-line anti-slop/no-module-mocking -- replace the network review request to test action state transitions deterministically.
vi.mock('@/services/reviewService', () => ({ requestDDLReview: vi.fn() }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- isolate review-history persistence while testing the hook's orchestration.
vi.mock('@/utils/reviewHistory', () => ({ saveReview: vi.fn().mockResolvedValue({}) }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- provide deterministic quota access responses for review action branches.
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
