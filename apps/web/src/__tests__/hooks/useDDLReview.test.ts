import * as aiTransport from '@/services/aiConversationService';

// oxlint-disable-next-line anti-slop/no-module-mocking -- Transport lifecycle has dedicated integration tests; these tests protect scenario decoding and hook state.
vi.mock('@/services/aiConversationService', () => ({
  fetchAIConversation: vi.fn(),
  hasResumableAIOperation: vi.fn(),
  resumeAIConversation: vi.fn(),
}));

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDDLReview } from '@/hooks/useDDLReview';
import { flushPromises } from '@/__tests__/utils/test-utils';
import { createQueryClientWrapper } from '@/__tests__/utils/queryClient';
import { createAITextStream as createStream } from '@/__tests__/utils/aiStream';

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

const createResponse = (body: BodyInit | null, status = 200) => new Response(body, { status });

describe('useDDLReview', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resumes a detached review of the same DDL without submitting it again', async () => {
    const { wrapper } = createQueryClientWrapper();

    const fetchMock = vi
      .spyOn(aiTransport, 'fetchAIConversation')
      .mockResolvedValue(createResponse(new ReadableStream()));

    const { result, rerender } = renderHook(
      ({ documentKey }) => useDDLReview(documentKey, 'table-1'),
      { wrapper, initialProps: { documentKey: 'document' } },
    );

    act(() => {
      void result.current.startReview('ddl', 'table', 'mysql');
    });

    await act(async () => {
      await flushPromises();
    });

    const [, init, options] = fetchMock.mock.calls[0];
    rerender({ documentKey: 'other-document' });
    expect(init.signal?.reason).toBe('detach');

    vi.spyOn(aiTransport, 'hasResumableAIOperation').mockImplementation(
      (key) => key === options?.resumeKey,
    );

    const resume = vi
      .spyOn(aiTransport, 'resumeAIConversation')
      .mockReturnValue(
        createResponse(createStream(['{"score": 9, "summary": "resumed", "suggestions": []}'])),
      );

    rerender({ documentKey: 'document' });

    await act(async () => {
      await result.current.resumeReview('ddl', 'table', 'mysql');
      await flushPromises();
    });

    expect(resume).toHaveBeenCalledWith(options?.resumeKey, expect.any(AbortSignal));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.result?.summary).toBe('resumed');
  });
});
