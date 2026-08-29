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
    const { result } = renderHook(() => useAIIndexAdvisor(), { wrapper });

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
});
