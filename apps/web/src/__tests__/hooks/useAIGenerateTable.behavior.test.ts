import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GenerateTableServiceResult } from '@/services/aiGenerateTableService';
import { useAIGenerateTable } from '@/hooks/useAIGenerateTable';
import { createQueryClientWrapper } from '@/__tests__/utils/queryClient';
import { useLocale } from '@/i18n/LocaleContext';
import type { PersistedState } from '@ddlbuilder/shared-types';

const aiServiceMocks = vi.hoisted(() => ({
  requestGenerateTable: vi.fn(),
}));

vi.mock('@/services/aiGenerateTableService', () => ({
  requestGenerateTable: aiServiceMocks.requestGenerateTable,
}));

vi.mock('@/auth/AuthSessionProvider', () => ({
  useAuthSession: () => ({
    status: 'signed_in',
    configured: true,
    userId: 'user-1',
    email: 'user@example.com',
    name: 'User One',
    emailVerified: true,
    creditBalance: 1000,
    creditsStatus: 'ready',
    authDialogOpen: false,
    signInWithEmail: vi.fn(),
    signUpWithEmail: vi.fn(),
    requestPasswordReset: vi.fn(),
    resetPassword: vi.fn(),
    sendVerificationEmail: vi.fn(),
    signOut: vi.fn(),
    refreshSession: vi.fn(),
    refreshCredits: vi.fn(),
    openAuthDialog: vi.fn(),
    closeAuthDialog: vi.fn(),
  }),
}));

function renderAIGenerateTableHook() {
  const { wrapper } = createQueryClientWrapper();
  return renderHook(() => useAIGenerateTable(), { wrapper });
}

function renderAIGenerateTableWithLocaleHook() {
  const { wrapper } = createQueryClientWrapper();
  return renderHook(
    () => ({
      ai: useAIGenerateTable(),
      locale: useLocale(),
    }),
    { wrapper },
  );
}

function createResult(
  tableName: string,
  fields: GenerateTableServiceResult['result']['fields'] = [],
): GenerateTableServiceResult {
  const result = {
    tableName,
    tableComment: `${tableName} 注释`,
    fields,
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
    let request!: Promise<void>;
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
    let older!: Promise<void>;
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

  it('should support continueConversation and clear actions', async () => {
    const firstFields = [
      {
        fieldName: 'id',
        fieldType: 'bigint',
        fieldComment: '主键',
        nullable: false,
        defaultKind: 'auto_increment',
      } as const,
    ];
    aiServiceMocks.requestGenerateTable
      .mockResolvedValueOnce(createResult('users', firstFields))
      .mockResolvedValueOnce(createResult('orders'));

    const { result } = renderAIGenerateTableHook();

    await act(async () => {
      await result.current.generateTable('生成用户表', 'mysql');
    });

    await act(async () => {
      await result.current.generateTable('补充订单表', 'mysql', {
        continueConversation: true,
      });
    });

    const secondCallPayload = aiServiceMocks.requestGenerateTable.mock.calls[1][0];
    expect(secondCallPayload.options.conversationHistory).toHaveLength(2);
    expect(secondCallPayload.options.previousSchema?.fields).toEqual(firstFields);
    expect(result.current.conversationHistory).toHaveLength(4);
    expect(result.current.previousResult?.tableName).toBe('users');
    expect(result.current.result?.tableName).toBe('orders');

    act(() => {
      result.current.clearResult();
    });
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();

    act(() => {
      result.current.clearConversation();
    });
    expect(result.current.conversationHistory).toEqual([]);
  });

  it('should send the current locale after switching language', async () => {
    aiServiceMocks.requestGenerateTable.mockResolvedValue(createResult('users'));

    const { result } = renderAIGenerateTableWithLocaleHook();

    act(() => {
      result.current.locale.setLocale('en-US');
    });

    await waitFor(() => {
      expect(result.current.locale.resolvedLocale).toBe('en-US');
    });

    await act(async () => {
      await result.current.ai.generateTable('generate users table', 'mysql');
    });

    expect(aiServiceMocks.requestGenerateTable).toHaveBeenCalledWith(
      expect.objectContaining({
        locale: 'en-US',
      }),
      expect.any(Object),
    );
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

  it('should abort previous request when new key arrives', async () => {
    let firstSignal: AbortSignal | null = null;
    aiServiceMocks.requestGenerateTable.mockImplementation((payload, options) => {
      if (payload.description === 'first') {
        firstSignal = options.signal;
        return new Promise<GenerateTableServiceResult>((_, reject) => {
          options.signal.addEventListener('abort', () => {
            reject(createAbortError());
          });
        });
      }
      return Promise.resolve(createResult('second_table'));
    });

    const { result } = renderAIGenerateTableHook();

    act(() => {
      void result.current.generateTable('first', 'mysql');
    });
    await waitFor(() => expect(result.current.isLoading).toBe(true));

    await act(async () => {
      await result.current.generateTable('second', 'mysql');
    });

    expect(firstSignal?.aborted).toBe(true);
    expect(result.current.result?.tableName).toBe('second_table');
    expect(result.current.error).toBeNull();
  });

  it('cancelGeneration should abort active request and reset loading', async () => {
    let activeSignal: AbortSignal | null = null;
    aiServiceMocks.requestGenerateTable.mockImplementation((_, options) => {
      activeSignal = options.signal;
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

    expect(activeSignal?.aborted).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBeNull();
  });

  it('should expose partialResult while streaming', async () => {
    let resolveRequest: ((value: GenerateTableServiceResult) => void) | null = null;
    const requestPromise = new Promise<GenerateTableServiceResult>((resolve) => {
      resolveRequest = resolve;
    });
    aiServiceMocks.requestGenerateTable.mockImplementation((_, options) => {
      options.onStreamingText?.('{"tableName":"stream_users"');
      return requestPromise;
    });

    const { result } = renderAIGenerateTableHook();

    act(() => {
      void result.current.generateTable('stream case', 'mysql');
    });

    await waitFor(() => {
      expect(result.current.streamingText).toContain('"tableName"');
    });
    expect(result.current.partialResult?.tableName).toBe('stream_users');

    await act(async () => {
      resolveRequest?.(createResult('stream_users'));
      await requestPromise;
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.partialResult).toBeNull();
    });
  });
});
