import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAIGenerateTable } from '@/hooks/useAIGenerateTable';
import { createQueryClientWrapper } from '@/__tests__/utils/queryClient';
import { createAITextStream } from '@/__tests__/utils/aiStream';

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

describe('useAIGenerateTable failure states', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should set error when description is empty', async () => {
    const { result } = renderAIGenerateTableHook();

    await act(async () => {
      await result.current.generateTable('   ', 'mysql');
    });

    expect(result.current.error).toBe('请输入表结构描述');
    expect(result.current.isLoading).toBe(false);
  });

  it('should set error when server responds with non-ok status', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: '生成失败' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderAIGenerateTableHook();

    await act(async () => {
      await result.current.generateTable('生成用户表', 'mysql');
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBe('生成失败');
    expect(result.current.isLoading).toBe(false);
  });

  it('should execute completed generation again for same params', async () => {
    const fetchMock = vi.fn().mockImplementation(() => ({
      ok: true,
      body: createAITextStream([
        JSON.stringify({
          tableName: 'users',
          tableComment: '用户表',
          fields: [],
          indexes: [],
          authObjects: [],
        }),
      ]),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderAIGenerateTableHook();

    await act(async () => {
      await result.current.generateTable('生成用户表', 'mysql');
    });

    await act(async () => {
      await result.current.generateTable('生成用户表', 'mysql');
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.result?.tableName).toBe('users');
  });
});
