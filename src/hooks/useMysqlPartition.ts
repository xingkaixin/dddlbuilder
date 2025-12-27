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
  setPartitionCount: (count: number) => void;
  addPartition: (partition: PartitionDefinition) => void;
  removePartition: (name: string) => void;
  updatePartition: (name: string, partition: PartitionDefinition) => void;
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
      // 切换分区类型时，清空分区定义
      partitions: [],
      columns: [],
    }));
  }, []);

  const setPartitionColumns = useCallback((columns: string[]) => {
    setMysqlPartitionConfig((prev) => ({
      ...prev,
      columns,
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

  return {
    mysqlPartitionConfig,
    setPartitionEnabled,
    setPartitionType,
    setPartitionColumns,
    setPartitionCount,
    addPartition,
    removePartition,
    updatePartition,
    resetPartition,
  };
}
