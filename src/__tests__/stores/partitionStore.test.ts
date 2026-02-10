import { beforeEach, describe, expect, it } from 'vitest';
import { usePartitionStore } from '@/stores';

function resetPartitionStore() {
  usePartitionStore.getState().resetPartition();
}

describe('partitionStore', () => {
  beforeEach(() => {
    resetPartitionStore();
  });

  it('应该在切换分区类型时清空分区定义与字段', () => {
    const state = usePartitionStore.getState();

    state.addPartition({ name: 'p1', value: '2024' });
    state.setPartitionColumns(['created_at']);
    state.setPartitionType('HASH');

    const current = usePartitionStore.getState();
    expect(current.mysqlPartitionConfig.type).toBe('HASH');
    expect(current.mysqlPartitionConfig.partitions).toEqual([]);
    expect(current.mysqlPartitionConfig.columns).toEqual([]);
    expect(current.mysqlPartitionConfig.expression).toBeUndefined();
  });

  it('应该支持生成月分区并重置', () => {
    const state = usePartitionStore.getState();

    state.generateRangePartitions('month');
    let current = usePartitionStore.getState();
    expect(current.mysqlPartitionConfig.partitions?.length).toBe(13);
    expect(current.mysqlPartitionConfig.partitions?.[12].name).toBe('pmax');

    current.resetPartition();
    current = usePartitionStore.getState();
    expect(current.mysqlPartitionConfig.enabled).toBe(false);
    expect(current.mysqlPartitionConfig.type).toBe('RANGE');
  });
});
