import { beforeEach, describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEditorStore } from '@/stores';

const useShardingState = useEditorStore;

function resetShardingStore() {
  useEditorStore.getState().resetCitusSharding();
}

describe('editor store sharding state', () => {
  beforeEach(() => {
    resetShardingStore();
  });

  it('应该返回默认配置', () => {
    const { result } = renderHook(() => useShardingState());

    expect(result.current.citusShardingConfig).toEqual({
      mode: 'reference',
      distributionColumn: undefined,
    });
  });

  it('应该正确设置分片模式为 reference', () => {
    const { result } = renderHook(() => useShardingState());

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
    const { result } = renderHook(() => useShardingState());

    act(() => {
      result.current.setDistributionColumn('user_id');
    });

    expect(result.current.citusShardingConfig.distributionColumn).toBe('user_id');
  });

  it('应该正确重置配置', () => {
    const { result } = renderHook(() => useShardingState());

    act(() => {
      result.current.setCitusMode('distributed');
      result.current.setDistributionColumn('tenant_id');
    });

    expect(result.current.citusShardingConfig.mode).toBe('distributed');
    expect(result.current.citusShardingConfig.distributionColumn).toBe('tenant_id');

    act(() => {
      result.current.resetCitusSharding();
    });

    expect(result.current.citusShardingConfig).toEqual({
      mode: 'reference',
      distributionColumn: undefined,
    });
  });
});
