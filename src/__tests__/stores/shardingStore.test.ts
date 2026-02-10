import { beforeEach, describe, expect, it } from 'vitest';
import { useShardingStore } from '@/stores';

function resetShardingStore() {
  useShardingStore.getState().resetCitusSharding();
}

describe('shardingStore', () => {
  beforeEach(() => {
    resetShardingStore();
  });

  it('应该设置分片模式并在 reference 时清空分布列', () => {
    const state = useShardingStore.getState();

    state.setCitusMode('distributed');
    state.setDistributionColumn('tenant_id');
    state.setCitusMode('reference');

    const current = useShardingStore.getState();
    expect(current.citusShardingConfig.mode).toBe('reference');
    expect(current.citusShardingConfig.distributionColumn).toBeUndefined();
  });

  it('应该支持直接设置和函数式更新', () => {
    const state = useShardingStore.getState();

    state.setCitusShardingConfig({
      mode: 'distributed',
      distributionColumn: 'org_id',
    });
    state.setCitusShardingConfig((prev) => ({
      ...prev,
      distributionColumn: 'user_id',
    }));

    const current = useShardingStore.getState();
    expect(current.citusShardingConfig).toEqual({
      mode: 'distributed',
      distributionColumn: 'user_id',
    });
  });
});
