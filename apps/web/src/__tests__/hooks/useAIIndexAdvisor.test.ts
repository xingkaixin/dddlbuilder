import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AIIndexAdvisorRequest, AIIndexAdvisorResult } from '@ddlbuilder/shared-types';
import { createQueryClientWrapper } from '@/__tests__/utils/queryClient';
import { useAIIndexAdvisor } from '@/hooks/useAIIndexAdvisor';
import type * as AIIndexAdvisorService from '@/services/aiIndexAdvisorService';

const serviceMocks = vi.hoisted(() => ({
  requestAIIndexAdvice: vi.fn(),
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- Advisor requests are controlled to test cancellation and document switching.
vi.mock('@/services/aiIndexAdvisorService', async (importOriginal) => ({
  ...(await importOriginal<typeof AIIndexAdvisorService>()),
  requestAIIndexAdvice: serviceMocks.requestAIIndexAdvice,
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- Advisor hooks receive a deterministic auth context.
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
  it.each(['workspace-2:users-draft'])(
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
      // SAFETY: The hook always passes an AbortSignal in the second service-call argument before rerender.
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
});
