import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMysqlPartition } from '@/hooks/useMysqlPartition';

describe('useMysqlPartition', () => {
  it('应该返回默认配置', () => {
    const { result } = renderHook(() => useMysqlPartition());

    expect(result.current.mysqlPartitionConfig).toEqual({
      enabled: false,
      type: 'RANGE',
      columns: [],
      partitionCount: 4,
      partitions: [],
    });
  });

  it('应该正确设置启用状态', () => {
    const { result } = renderHook(() => useMysqlPartition());

    act(() => {
      result.current.setPartitionEnabled(true);
    });

    expect(result.current.mysqlPartitionConfig.enabled).toBe(true);
  });

  it('应该正确设置分区类型并清空分区', () => {
    const { result } = renderHook(() => useMysqlPartition());

    // First add a partition
    act(() => {
      result.current.addPartition({ name: 'p1', value: '2024' });
    });
    expect(result.current.mysqlPartitionConfig.partitions).toHaveLength(1);

    // Change type should clear partitions
    act(() => {
      result.current.setPartitionType('HASH');
    });

    expect(result.current.mysqlPartitionConfig.type).toBe('HASH');
    expect(result.current.mysqlPartitionConfig.partitions).toHaveLength(0);
    expect(result.current.mysqlPartitionConfig.columns).toHaveLength(0);
  });

  it('应该正确设置分区列并清空表达式', () => {
    const { result } = renderHook(() => useMysqlPartition());

    // First set expression
    act(() => {
      result.current.setPartitionExpression('YEAR(created_at)');
    });
    expect(result.current.mysqlPartitionConfig.expression).toBe(
      'YEAR(created_at)',
    );

    // Setting columns should clear expression
    act(() => {
      result.current.setPartitionColumns(['id', 'name']);
    });

    expect(result.current.mysqlPartitionConfig.columns).toEqual(['id', 'name']);
    expect(result.current.mysqlPartitionConfig.expression).toBeUndefined();
  });

  it('应该正确设置表达式并清空列', () => {
    const { result } = renderHook(() => useMysqlPartition());

    // First set columns
    act(() => {
      result.current.setPartitionColumns(['id']);
    });
    expect(result.current.mysqlPartitionConfig.columns).toEqual(['id']);

    // Setting expression should clear columns
    act(() => {
      result.current.setPartitionExpression('dayofmonth(start_time)');
    });

    expect(result.current.mysqlPartitionConfig.expression).toBe(
      'dayofmonth(start_time)',
    );
    expect(result.current.mysqlPartitionConfig.columns).toHaveLength(0);
  });

  it('应该正确设置分区数量，最小值为1', () => {
    const { result } = renderHook(() => useMysqlPartition());

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
  });

  it('应该正确添加、更新和删除分区', () => {
    const { result } = renderHook(() => useMysqlPartition());

    // Add partitions
    act(() => {
      result.current.addPartition({ name: 'p1', value: '2024' });
      result.current.addPartition({ name: 'p2', value: '2025' });
    });
    expect(result.current.mysqlPartitionConfig.partitions).toHaveLength(2);

    // Update partition
    act(() => {
      result.current.updatePartition('p1', { name: 'p1', value: '2023' });
    });
    expect(result.current.mysqlPartitionConfig.partitions?.[0].value).toBe(
      '2023',
    );

    // Remove partition
    act(() => {
      result.current.removePartition('p1');
    });
    expect(result.current.mysqlPartitionConfig.partitions).toHaveLength(1);
    expect(result.current.mysqlPartitionConfig.partitions?.[0].name).toBe('p2');
  });

  it('应该正确生成年分区', () => {
    const { result } = renderHook(() => useMysqlPartition());

    act(() => {
      result.current.generateRangePartitions('year');
    });

    const partitions = result.current.mysqlPartitionConfig.partitions;
    expect(partitions).toBeDefined();
    expect(partitions?.length).toBe(5); // 4 years + MAXVALUE
    expect(partitions?.[partitions?.length - 1].name).toBe('pmax');
    expect(partitions?.[partitions?.length - 1].value).toBe('MAXVALUE');
  });

  it('应该正确生成月分区', () => {
    const { result } = renderHook(() => useMysqlPartition());

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

  it('应该正确生成日分区', () => {
    const { result } = renderHook(() => useMysqlPartition());

    act(() => {
      result.current.generateRangePartitions('day');
    });

    const partitions = result.current.mysqlPartitionConfig.partitions;
    expect(partitions).toBeDefined();
    expect(partitions?.length).toBe(32); // 31 days + MAXVALUE
    expect(partitions?.[0].name).toBe('p01');
    expect(partitions?.[30].name).toBe('p31');
    expect(partitions?.[31].name).toBe('pmax');
  });

  it('应该正确重置配置', () => {
    const { result } = renderHook(() => useMysqlPartition());

    act(() => {
      result.current.setPartitionEnabled(true);
      result.current.setPartitionType('HASH');
      result.current.setPartitionColumns(['id']);
      result.current.setPartitionCount(32);
    });

    act(() => {
      result.current.resetPartition();
    });

    expect(result.current.mysqlPartitionConfig).toEqual({
      enabled: false,
      type: 'RANGE',
      columns: [],
      partitionCount: 4,
      partitions: [],
    });
  });

  it('应该从持久化状态恢复配置', () => {
    const persistedState = {
      mysqlPartitionConfig: {
        enabled: true,
        type: 'HASH' as const,
        columns: ['user_id'],
        partitionCount: 8,
        partitions: [],
      },
    };

    const { result } = renderHook(() => useMysqlPartition(persistedState));

    expect(result.current.mysqlPartitionConfig.enabled).toBe(true);
    expect(result.current.mysqlPartitionConfig.type).toBe('HASH');
    expect(result.current.mysqlPartitionConfig.columns).toEqual(['user_id']);
    expect(result.current.mysqlPartitionConfig.partitionCount).toBe(8);
  });
});
