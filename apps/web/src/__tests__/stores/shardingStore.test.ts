import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from '@/stores';

function resetShardingStore() {
  useEditorStore.getState().resetCitusSharding();
}

describe('shardingStore', () => {
  beforeEach(() => {
    resetShardingStore();
  });

  it('应该设置分片模式并在 reference 时清空分布列', () => {
    const state = useEditorStore.getState();

    state.setCitusMode('distributed');
    state.setDistributionColumn('tenant_id');
    state.setCitusMode('reference');

    const current = useEditorStore.getState();
    expect(current.citusShardingConfig.mode).toBe('reference');
    expect(current.citusShardingConfig.distributionColumn).toBeUndefined();
  });

  it('应该支持直接设置和函数式更新', () => {
    const state = useEditorStore.getState();

    state.setCitusShardingConfig({
      mode: 'distributed',
      distributionColumn: 'org_id',
    });
    state.setCitusShardingConfig((prev) => ({
      ...prev,
      distributionColumn: 'user_id',
    }));

    const current = useEditorStore.getState();
    expect(current.citusShardingConfig).toEqual({
      mode: 'distributed',
      distributionColumn: 'user_id',
    });
  });

  it('字段重命名时应同步分片字段', () => {
    const state = useEditorStore.getState();

    state.setCitusShardingConfig({
      mode: 'distributed',
      distributionColumn: 'tenant_id',
    });
    state.syncShardingFieldRename('tenant_id', 'org_id');

    const current = useEditorStore.getState();
    expect(current.citusShardingConfig).toEqual({
      mode: 'distributed',
      distributionColumn: 'org_id',
    });
  });
});
