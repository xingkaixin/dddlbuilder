import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAIGenerateTable } from '@/hooks/useAIGenerateTable';

describe('useAIGenerateTable failure states', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should set error when description is empty', async () => {
    const { result } = renderHook(() => useAIGenerateTable());

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

    const { result } = renderHook(() => useAIGenerateTable());

    await act(async () => {
      await result.current.generateTable('生成用户表', 'mysql');
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBe('生成失败');
    expect(result.current.isLoading).toBe(false);
  });
});
