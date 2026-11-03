import { beforeEach, describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEditorStore } from '@/stores';

const usePartitionState = useEditorStore;

function resetPartitionStore() {
  useEditorStore.getState().resetPartition();
}

describe('editor store partition state', () => {
  beforeEach(() => {
    resetPartitionStore();
  });

  it('应该正确设置分区列并清空表达式', () => {
    const { result } = renderHook(() => usePartitionState());

    // First set expression
    act(() => {
      result.current.setPartitionExpression('YEAR(created_at)');
    });
    expect(result.current.mysqlPartitionConfig.expression).toBe('YEAR(created_at)');

    // Setting columns should clear expression
    act(() => {
      result.current.setPartitionColumns(['id', 'name']);
    });

    expect(result.current.mysqlPartitionConfig.columns).toEqual(['id', 'name']);
    expect(result.current.mysqlPartitionConfig.expression).toBeUndefined();
  });

  it('应该正确设置分区数量，最小值为1', () => {
    const { result } = renderHook(() => usePartitionState());

    act(() => {
      result.current.setPartitionCount(16);
    });
    expect(result.current.mysqlPartitionConfig.partitionCount).toBe(16);

    act(() => {
      result.current.setPartitionCount(0);
    });
    expect(result.current.mysqlPartitionConfig.partitionCount).toBe(1);

    act(() => {
      result.current.setPartitionCount(-5);
    });
    expect(result.current.mysqlPartitionConfig.partitionCount).toBe(1);

    act(() => {
      result.current.setPartitionCount(1_000_000);
    });
    expect(result.current.mysqlPartitionConfig.partitionCount).toBe(8192);
  });

  it('应该正确生成月分区', () => {
    const { result } = renderHook(() => usePartitionState());

    act(() => {
      result.current.generateRangePartitions('month');
    });

    const partitions = result.current.mysqlPartitionConfig.partitions;
    expect(partitions).toBeDefined();
    expect(partitions?.length).toBe(13); // 12 months + MAXVALUE
    expect(partitions?.[0].name).toBe('p01');
    expect(partitions?.[11].name).toBe('p12');
    expect(partitions?.[12].name).toBe('pmax');
  });
});
