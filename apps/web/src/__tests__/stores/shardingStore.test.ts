import { describe, expect, it } from 'vitest';
import { useEditorStore } from '@/stores/editorStore';

describe('shardingStore', () => {
  it('应该设置分片模式并在 reference 时清空分布列', () => {
    const state = useEditorStore.getState();

    state.setCitusMode('distributed');
    state.setDistributionColumn('tenant_id');
    state.setCitusMode('reference');

    const current = useEditorStore.getState();
    expect(current.citusShardingConfig.mode).toBe('reference');
    expect(current.citusShardingConfig.distributionColumn).toBeUndefined();
  });
});
