import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { appQueryClient, createAppQueryClient, shouldRetryQuery } from '@/lib/queryClient';

describe('queryClient', () => {
  it('createAppQueryClient 应该配置默认查询与变更策略', () => {
    const queryClient = createAppQueryClient();
    const defaults = queryClient.getDefaultOptions();

    expect(defaults.queries?.retry).toBe(shouldRetryQuery);
    expect(defaults.queries?.refetchOnWindowFocus).toBe(false);
    expect(defaults.mutations?.retry).toBe(0);
  });

  it('appQueryClient 应该是可复用实例', () => {
    expect(appQueryClient).toBeInstanceOf(QueryClient);
    expect(appQueryClient.getDefaultOptions().queries?.retry).toBe(shouldRetryQuery);
  });

  it('读取请求仅重试一次网络或服务端错误', () => {
    expect(shouldRetryQuery(0, new Error('network'))).toBe(true);
    expect(shouldRetryQuery(0, { status: 503 })).toBe(true);
    expect(shouldRetryQuery(0, { status: 401 })).toBe(false);
    expect(shouldRetryQuery(1, new Error('network'))).toBe(false);
  });
});
