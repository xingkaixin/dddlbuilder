import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { appQueryClient, createAppQueryClient } from '@/lib/queryClient';

describe('queryClient', () => {
  it('createAppQueryClient 应该配置默认查询与变更策略', () => {
    const queryClient = createAppQueryClient();
    const defaults = queryClient.getDefaultOptions();

    expect(defaults.queries?.retry).toBe(1);
    expect(defaults.queries?.refetchOnWindowFocus).toBe(false);
    expect(defaults.mutations?.retry).toBe(0);
  });

  it('appQueryClient 应该是可复用实例', () => {
    expect(appQueryClient).toBeInstanceOf(QueryClient);
    expect(appQueryClient.getDefaultOptions().queries?.retry).toBe(1);
  });
});
