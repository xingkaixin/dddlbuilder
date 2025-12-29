import { useState, useCallback, useEffect } from 'react';
import type {
  MysqlPartitionType,
  MysqlPartitionConfig,
  PartitionDefinition,
  PersistedState,
} from '@/types';

export interface UseMysqlPartitionReturn {
  mysqlPartitionConfig: MysqlPartitionConfig;
  setPartitionEnabled: (enabled: boolean) => void;
  setPartitionType: (type: MysqlPartitionType) => void;
  setPartitionColumns: (columns: string[]) => void;
  setPartitionExpression: (expression: string) => void;
  setPartitionCount: (count: number) => void;
  addPartition: (partition: PartitionDefinition) => void;
  removePartition: (name: string) => void;
  updatePartition: (name: string, partition: PartitionDefinition) => void;
  generateRangePartitions: (preset: 'year' | 'month' | 'day') => void;
  resetPartition: () => void;
}

const DEFAULT_CONFIG: MysqlPartitionConfig = {
  enabled: false,
  type: 'RANGE',
  columns: [],
  partitionCount: 4,
  partitions: [],
};

export function useMysqlPartition(
  persistedState?: Pick<PersistedState, 'mysqlPartitionConfig'>,
): UseMysqlPartitionReturn {
  const [mysqlPartitionConfig, setMysqlPartitionConfig] =
    useState<MysqlPartitionConfig>(DEFAULT_CONFIG);
  const [initialized, setInitialized] = useState(false);

  // Restore from persisted state
  useEffect(() => {
    if (persistedState?.mysqlPartitionConfig && !initialized) {
      setMysqlPartitionConfig(persistedState.mysqlPartitionConfig);
      setInitialized(true);
    }
  }, [persistedState, initialized]);

  const setPartitionEnabled = useCallback((enabled: boolean) => {
    setMysqlPartitionConfig((prev) => ({
      ...prev,
      enabled,
    }));
  }, []);

  const setPartitionType = useCallback((type: MysqlPartitionType) => {
    setMysqlPartitionConfig((prev) => ({
      ...prev,
      type,
      // 切换分区类型时，清空分区定义和表达式
      partitions: [],
      columns: [],
      expression: undefined,
    }));
  }, []);

  const setPartitionColumns = useCallback((columns: string[]) => {
    setMysqlPartitionConfig((prev) => ({
      ...prev,
      columns,
      // 选择字段时清空表达式
      expression: undefined,
    }));
  }, []);

  const setPartitionExpression = useCallback((expression: string) => {
    setMysqlPartitionConfig((prev) => ({
      ...prev,
      expression: expression || undefined,
      // 使用表达式时清空字段选择
      columns: [],
    }));
  }, []);

  const setPartitionCount = useCallback((count: number) => {
    setMysqlPartitionConfig((prev) => ({
      ...prev,
      partitionCount: Math.max(1, count),
    }));
  }, []);

  const addPartition = useCallback((partition: PartitionDefinition) => {
    setMysqlPartitionConfig((prev) => ({
      ...prev,
      partitions: [...(prev.partitions || []), partition],
    }));
  }, []);

  const removePartition = useCallback((name: string) => {
    setMysqlPartitionConfig((prev) => ({
      ...prev,
      partitions: (prev.partitions || []).filter((p) => p.name !== name),
    }));
  }, []);

  const updatePartition = useCallback(
    (name: string, partition: PartitionDefinition) => {
      setMysqlPartitionConfig((prev) => ({
        ...prev,
        partitions: (prev.partitions || []).map((p) =>
          p.name === name ? partition : p,
        ),
      }));
    },
    [],
  );

  const resetPartition = useCallback(() => {
    setMysqlPartitionConfig(DEFAULT_CONFIG);
  }, []);

  // 快速生成常用的 RANGE 分区
  const generateRangePartitions = useCallback(
    (preset: 'year' | 'month' | 'day') => {
      const currentYear = new Date().getFullYear();
      let partitions: PartitionDefinition[] = [];

      switch (preset) {
        case 'year':
          // 生成前3年 + 当年 + 下一年 + MAXVALUE
          partitions = [
            { name: `p${currentYear - 2}`, value: String(currentYear - 1) },
            { name: `p${currentYear - 1}`, value: String(currentYear) },
            { name: `p${currentYear}`, value: String(currentYear + 1) },
            { name: `p${currentYear + 1}`, value: String(currentYear + 2) },
            { name: 'pmax', value: 'MAXVALUE' },
          ];
          break;
        case 'month':
          // 生成12个月分区
          partitions = Array.from({ length: 12 }, (_, i) => ({
            name: `p${String(i + 1).padStart(2, '0')}`,
            value: String(i + 2 > 12 ? 13 : i + 2),
          }));
          partitions.push({ name: 'pmax', value: 'MAXVALUE' });
          break;
        case 'day':
          // 生成31天分区
          partitions = Array.from({ length: 31 }, (_, i) => ({
            name: `p${String(i + 1).padStart(2, '0')}`,
            value: String(i + 2),
          }));
          partitions.push({ name: 'pmax', value: 'MAXVALUE' });
          break;
      }

      setMysqlPartitionConfig((prev) => ({
        ...prev,
        partitions,
      }));
    },
    [],
  );

  return {
    mysqlPartitionConfig,
    setPartitionEnabled,
    setPartitionType,
    setPartitionColumns,
    setPartitionExpression,
    setPartitionCount,
    addPartition,
    removePartition,
    updatePartition,
    generateRangePartitions,
    resetPartition,
  };
}
