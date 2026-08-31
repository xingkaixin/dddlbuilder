import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIIndexAdvisorRequest, AIIndexAdvisorResult } from '@ddlbuilder/shared-types';
import { createQueryClientWrapper } from '@/__tests__/utils/queryClient';
import { useAIIndexAdvisor } from '@/hooks/useAIIndexAdvisor';
import type * as AIIndexAdvisorService from '@/services/aiIndexAdvisorService';

const serviceMocks = vi.hoisted(() => ({
  requestAIIndexAdvice: vi.fn(),
}));

vi.mock('@/services/aiIndexAdvisorService', async (importOriginal) => ({
  ...(await importOriginal<typeof AIIndexAdvisorService>()),
  requestAIIndexAdvice: serviceMocks.requestAIIndexAdvice,
}));

vi.mock('@/auth/AuthSessionProvider', () => ({
  useAuthIdentity: () => ({ status: 'signed_in', userId: 'user-1' }),
  useAuthCredits: () => ({
    creditBalance: 1000,
    creditsStatus: 'ready',
    refreshCredits: vi.fn(),
  }),
  useAuthDialog: () => ({ openAuthDialog: vi.fn() }),
}));

const request = (queryPatterns: string): AIIndexAdvisorRequest => ({
  dbType: 'mysql',
  tableName: 'users',
  tableComment: '',
  fields: [{ fieldName: 'id', fieldType: 'bigint', fieldComment: '', nullable: false }],
  indexes: [],
  queryPatterns,
});

const response = (summary: string): AIIndexAdvisorResult => ({
  summary,
  recommendations: [],
});

describe('useAIIndexAdvisor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the latest result when an aborted request resolves late', async () => {
    let resolveOlder!: (value: AIIndexAdvisorResult) => void;
    serviceMocks.requestAIIndexAdvice
      .mockReturnValueOnce(
        new Promise<AIIndexAdvisorResult>((resolve) => {
          resolveOlder = resolve;
        }),
      )
      .mockResolvedValueOnce(response('newer'));
    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useAIIndexAdvisor('workspace-1:users-draft'), { wrapper });

    let older!: Promise<AIIndexAdvisorResult | null>;
    act(() => {
      older = result.current.analyzeIndexes(request('older'));
    });
    await waitFor(() => expect(serviceMocks.requestAIIndexAdvice).toHaveBeenCalledOnce());

    await act(async () => {
      await result.current.analyzeIndexes(request('newer'));
    });
    expect(result.current.result?.summary).toBe('newer');

    await act(async () => {
      resolveOlder(response('older'));
      await older;
    });

    expect(result.current.result?.summary).toBe('newer');
  });

  it.each(['workspace-1:other-users-draft', 'workspace-2:users-draft'])(
    'cancels advice when the document changes to %s',
    async (nextDocumentKey) => {
      let finish!: (value: AIIndexAdvisorResult) => void;
      serviceMocks.requestAIIndexAdvice.mockReturnValueOnce(
        new Promise<AIIndexAdvisorResult>((resolve) => {
          finish = resolve;
        }),
      );
      const { wrapper } = createQueryClientWrapper();
      const { result, rerender } = renderHook(({ key }) => useAIIndexAdvisor(key), {
        wrapper,
        initialProps: { key: 'workspace-1:users-draft' },
      });
      let pending!: Promise<AIIndexAdvisorResult | null>;
      act(() => {
        pending = result.current.analyzeIndexes(request('email lookup'));
      });
      const signal = serviceMocks.requestAIIndexAdvice.mock.calls[0][1] as AbortSignal;
      expect(result.current.isLoading).toBe(true);

      rerender({ key: nextDocumentKey });

      expect(signal.aborted).toBe(true);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.result).toBeNull();
      await act(async () => {
        finish(response('old document'));
        expect(await pending).toBeNull();
      });
      expect(result.current.result).toBeNull();
      expect(result.current.error).toBeNull();
    },
  );

  it('discards completed advice when leaving and returning to a document', async () => {
    serviceMocks.requestAIIndexAdvice.mockResolvedValueOnce(response('users advice'));
    const { wrapper } = createQueryClientWrapper();
    const { result, rerender } = renderHook(({ key }) => useAIIndexAdvisor(key), {
      wrapper,
      initialProps: { key: 'workspace-1:users-draft' },
    });
    await act(async () => {
      await result.current.analyzeIndexes(request('email lookup'));
    });
    expect(result.current.result?.summary).toBe('users advice');

    rerender({ key: 'workspace-1:other-users-draft' });
    expect(result.current.result).toBeNull();
    rerender({ key: 'workspace-1:users-draft' });
    expect(result.current.result).toBeNull();
  });
});
