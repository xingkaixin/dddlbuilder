import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GenerateTableServiceResult } from '@/services/aiGenerateTableService';
import { useAIGenerateTable } from '@/hooks/useAIGenerateTable';
import { createQueryClientWrapper } from '@/__tests__/utils/queryClient';
import type { PersistedState } from '@ddlbuilder/shared-types';

const aiServiceMocks = vi.hoisted(() => ({
  requestGenerateTable: vi.fn(),
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- replace the AI network request to test cancellation and request ordering.
vi.mock('@/services/aiGenerateTableService', () => ({
  requestGenerateTable: aiServiceMocks.requestGenerateTable,
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- provide a stable signed-in identity while testing hook request behavior.
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

function renderAIGenerateTableHook() {
  const { wrapper } = createQueryClientWrapper();

  return renderHook(() => useAIGenerateTable(), { wrapper });
}

function createResult(tableName: string): GenerateTableServiceResult {
  const result = {
    tableName,
    tableComment: `${tableName} 注释`,
    fields: [],
    indexes: [],
  };

  return {
    fullText: JSON.stringify(result),
    result,
  };
}

function createAbortError() {
  const err = new Error('aborted');
  err.name = 'AbortError';

  return err;
}

describe('useAIGenerateTable behaviors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps the completed patch paired with its request snapshot', async () => {
    const base: PersistedState = {
      schemaName: '',
      tableName: 'users',
      tableComment: 'request baseline',
      dbType: 'mysql',
      sqlFormatMode: 'compact',
      rows: [],
      indexes: [],
      addCount: 10,
      authInput: '',
      authObjects: [],
    };
    let complete!: (response: GenerateTableServiceResult) => void;
    aiServiceMocks.requestGenerateTable.mockReturnValueOnce(
      new Promise<GenerateTableServiceResult>((resolve) => {
        complete = resolve;
      }),
    );
    const { result } = renderAIGenerateTableHook();
    let request!: Promise<boolean>;
    act(() => {
      request = result.current.generateTable('change', 'mysql', {
        mode: 'patch',
        existingConfig: base,
      });
    });
    await waitFor(() => expect(aiServiceMocks.requestGenerateTable).toHaveBeenCalledTimes(1));
    base.tableComment = 'concurrent edit';
    await act(async () => {
      complete(createResult('users'));
      await request;
    });
    expect(result.current.resultBaseState?.tableComment).toBe('request baseline');
    expect(
      aiServiceMocks.requestGenerateTable.mock.calls[0][0].options.existingConfig.tableComment,
    ).toBe('request baseline');
    act(() => result.current.clearResult());
    expect(result.current.resultBaseState).toBeNull();
  });

  it('ignores a late result from a replaced request', async () => {
    let complete!: (response: GenerateTableServiceResult) => void;
    aiServiceMocks.requestGenerateTable
      .mockReturnValueOnce(
        new Promise<GenerateTableServiceResult>((resolve) => {
          complete = resolve;
        }),
      )
      .mockResolvedValueOnce(createResult('newer'));
    const { result } = renderAIGenerateTableHook();
    let older!: Promise<boolean>;
    act(() => {
      older = result.current.generateTable('older', 'mysql');
    });
    await waitFor(() => expect(aiServiceMocks.requestGenerateTable).toHaveBeenCalledTimes(1));
    await act(async () => {
      await result.current.generateTable('newer', 'mysql');
    });
    await act(async () => {
      complete(createResult('older'));
      await older;
    });
    expect(result.current.result?.tableName).toBe('newer');
    expect(result.current.conversationHistory[0].content).toBe('newer');
  });

  it('should ignore duplicated in-flight request with same key', async () => {
    let resolveRequest: ((value: GenerateTableServiceResult) => void) | null = null;

    const requestPromise = new Promise<GenerateTableServiceResult>((resolve) => {
      resolveRequest = resolve;
    });
    aiServiceMocks.requestGenerateTable.mockReturnValue(requestPromise);

    const { result } = renderAIGenerateTableHook();

    act(() => {
      void result.current.generateTable('生成用户表', 'mysql');
    });
    await waitFor(() => expect(result.current.isLoading).toBe(true));

    act(() => {
      void result.current.generateTable(' 生成用户表 ', 'mysql');
    });

    expect(aiServiceMocks.requestGenerateTable).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveRequest?.(createResult('users'));
      await requestPromise;
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it('cancelGeneration should abort active request and reset loading', async () => {
    type ActiveRequestSignals = { active?: AbortSignal };

    const requestSignals: ActiveRequestSignals = {};
    aiServiceMocks.requestGenerateTable.mockImplementation((_, options) => {
      requestSignals.active = options.signal;

      return new Promise<GenerateTableServiceResult>((_, reject) => {
        options.signal.addEventListener('abort', () => {
          reject(createAbortError());
        });
      });
    });

    const { result } = renderAIGenerateTableHook();

    act(() => {
      void result.current.generateTable('long task', 'mysql');
    });
    await waitFor(() => expect(result.current.isLoading).toBe(true));

    act(() => {
      result.current.cancelGeneration();
    });

    expect(requestSignals.active?.aborted).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBeNull();
  });
});
