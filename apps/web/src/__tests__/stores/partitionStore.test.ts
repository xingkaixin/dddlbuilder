import { describe, expect, it } from 'vitest';
import { useEditorStore } from '@/stores';

describe('partitionStore', () => {
  it('应该在切换分区类型时清空分区定义与字段', () => {
    const state = useEditorStore.getState();

    state.addPartition({ id: 'p1', name: 'p1', value: '2024' });
    state.setPartitionColumns(['created_at']);
    state.setPartitionType('HASH');

    const current = useEditorStore.getState();
    expect(current.mysqlPartitionConfig.type).toBe('HASH');
    expect(current.mysqlPartitionConfig.partitions).toEqual([]);
    expect(current.mysqlPartitionConfig.columns).toEqual([]);
    expect(current.mysqlPartitionConfig.expression).toBeUndefined();
  });
});
