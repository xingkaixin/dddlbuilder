import { useEffect, useRef } from 'react';
import type {
  MysqlPartitionType,
  MysqlPartitionConfig,
  PartitionDefinition,
  PersistedState,
} from '@/types';
import { usePartitionStore } from '@/stores';

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
  setMysqlPartitionConfig: React.Dispatch<
    React.SetStateAction<MysqlPartitionConfig>
  >;
  resetPartition: () => void;
}

export function useMysqlPartition(
  persistedState?: Pick<PersistedState, 'mysqlPartitionConfig'>,
): UseMysqlPartitionReturn {
  const mysqlPartitionConfig = usePartitionStore(
    (state) => state.mysqlPartitionConfig,
  );
  const setPartitionEnabled = usePartitionStore(
    (state) => state.setPartitionEnabled,
  );
  const setPartitionType = usePartitionStore((state) => state.setPartitionType);
  const setPartitionColumns = usePartitionStore(
    (state) => state.setPartitionColumns,
  );
  const setPartitionExpression = usePartitionStore(
    (state) => state.setPartitionExpression,
  );
  const setPartitionCount = usePartitionStore(
    (state) => state.setPartitionCount,
  );
  const addPartition = usePartitionStore((state) => state.addPartition);
  const removePartition = usePartitionStore((state) => state.removePartition);
  const updatePartition = usePartitionStore((state) => state.updatePartition);
  const generateRangePartitions = usePartitionStore(
    (state) => state.generateRangePartitions,
  );
  const setMysqlPartitionConfig = usePartitionStore(
    (state) => state.setMysqlPartitionConfig,
  );
  const resetPartition = usePartitionStore((state) => state.resetPartition);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!persistedState?.mysqlPartitionConfig || initializedRef.current) return;
    setMysqlPartitionConfig(persistedState.mysqlPartitionConfig);
    initializedRef.current = true;
  }, [persistedState, setMysqlPartitionConfig]);

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
    setMysqlPartitionConfig,
    resetPartition,
  };
}
