import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCitusSharding } from '@/hooks/useCitusSharding';

describe('useCitusSharding', () => {
  it('应该返回默认配置', () => {
    const { result } = renderHook(() => useCitusSharding());

    expect(result.current.citusShardingConfig).toEqual({
      mode: 'reference',
      distributionColumn: undefined,
    });
  });

  it('应该正确设置分片模式为 reference', () => {
    const { result } = renderHook(() => useCitusSharding());

    act(() => {
      result.current.setCitusMode('distributed');
    });
    expect(result.current.citusShardingConfig.mode).toBe('distributed');

    act(() => {
      result.current.setCitusMode('reference');
    });
    expect(result.current.citusShardingConfig.mode).toBe('reference');
  });

  it('应该正确设置分布列', () => {
    const { result } = renderHook(() => useCitusSharding());

    act(() => {
      result.current.setDistributionColumn('user_id');
    });

    expect(result.current.citusShardingConfig.distributionColumn).toBe(
      'user_id',
    );
  });

  it('应该正确重置配置', () => {
    const { result } = renderHook(() => useCitusSharding());

    act(() => {
      result.current.setCitusMode('distributed');
      result.current.setDistributionColumn('tenant_id');
    });

    expect(result.current.citusShardingConfig.mode).toBe('distributed');
    expect(result.current.citusShardingConfig.distributionColumn).toBe(
      'tenant_id',
    );

    act(() => {
      result.current.resetCitusSharding();
    });

    expect(result.current.citusShardingConfig).toEqual({
      mode: 'reference',
      distributionColumn: undefined,
    });
  });

  it('应该从持久化状态恢复配置', () => {
    const persistedState = {
      citusShardingConfig: {
        mode: 'distributed' as const,
        distributionColumn: 'org_id',
      },
    };

    const { result } = renderHook(() => useCitusSharding(persistedState));

    expect(result.current.citusShardingConfig.mode).toBe('distributed');
    expect(result.current.citusShardingConfig.distributionColumn).toBe(
      'org_id',
    );
  });
});
