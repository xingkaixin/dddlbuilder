import {
  normalizeMysqlPartitionCount,
  type MysqlPartitionConfig,
  type PartitionDefinition,
} from '@ddlbuilder/shared-types';
import type { EditorSetState, PartitionSlice } from './editorStoreTypes';

export const DEFAULT_PARTITION_CONFIG: MysqlPartitionConfig = {
  enabled: false,
  type: 'RANGE',
  columns: [],
  partitionCount: 4,
  partitions: [],
};

export const createPartitionSlice = (set: EditorSetState): PartitionSlice => ({
  mysqlPartitionConfig: DEFAULT_PARTITION_CONFIG,
  setPartitionEnabled: (enabled) =>
    set((state) => ({
      mysqlPartitionConfig: {
        ...state.mysqlPartitionConfig,
        enabled,
      },
    })),
  setPartitionType: (type) =>
    set((state) => ({
      mysqlPartitionConfig: {
        ...state.mysqlPartitionConfig,
        type,
        partitions: [],
        columns: [],
        expression: undefined,
      },
    })),
  setPartitionColumns: (columns) =>
    set((state) => ({
      mysqlPartitionConfig: {
        ...state.mysqlPartitionConfig,
        columns,
        expression: undefined,
      },
    })),
  setPartitionExpression: (expression) =>
    set((state) => ({
      mysqlPartitionConfig: {
        ...state.mysqlPartitionConfig,
        expression: expression || undefined,
        columns: [],
      },
    })),
  setPartitionCount: (count) =>
    set((state) => ({
      mysqlPartitionConfig: {
        ...state.mysqlPartitionConfig,
        partitionCount: normalizeMysqlPartitionCount(count),
      },
    })),
  addPartition: (partition) =>
    set((state) => ({
      mysqlPartitionConfig: {
        ...state.mysqlPartitionConfig,
        partitions: [...(state.mysqlPartitionConfig.partitions || []), partition],
      },
    })),
  removePartition: (index) =>
    set((state) => ({
      mysqlPartitionConfig: {
        ...state.mysqlPartitionConfig,
        partitions: (state.mysqlPartitionConfig.partitions || []).filter(
          (_, current) => current !== index,
        ),
      },
    })),
  updatePartition: (index, partition) =>
    set((state) => ({
      mysqlPartitionConfig: {
        ...state.mysqlPartitionConfig,
        partitions: (state.mysqlPartitionConfig.partitions || []).map((current, currentIndex) =>
          currentIndex === index ? partition : current,
        ),
      },
    })),
  generateRangePartitions: (preset) => {
    const currentYear = new Date().getFullYear();
    let partitions: PartitionDefinition[] = [];

    switch (preset) {
      case 'year':
        partitions = [
          { name: `p${currentYear - 2}`, value: String(currentYear - 1) },
          { name: `p${currentYear - 1}`, value: String(currentYear) },
          { name: `p${currentYear}`, value: String(currentYear + 1) },
          { name: `p${currentYear + 1}`, value: String(currentYear + 2) },
          { name: 'pmax', value: 'MAXVALUE' },
        ];
        break;
      case 'month':
        partitions = Array.from({ length: 12 }, (_, index) => ({
          name: `p${String(index + 1).padStart(2, '0')}`,
          value: String(index + 2 > 12 ? 13 : index + 2),
        }));
        partitions.push({ name: 'pmax', value: 'MAXVALUE' });
        break;
      case 'day':
        partitions = Array.from({ length: 31 }, (_, index) => ({
          name: `p${String(index + 1).padStart(2, '0')}`,
          value: String(index + 2),
        }));
        partitions.push({ name: 'pmax', value: 'MAXVALUE' });
        break;
    }

    set((state) => ({
      mysqlPartitionConfig: {
        ...state.mysqlPartitionConfig,
        partitions,
      },
    }));
  },
  setMysqlPartitionConfig: (value) =>
    set((state) => ({
      mysqlPartitionConfig: typeof value === 'function' ? value(state.mysqlPartitionConfig) : value,
    })),
  resetPartition: () =>
    set({
      mysqlPartitionConfig: DEFAULT_PARTITION_CONFIG,
    }),
});
