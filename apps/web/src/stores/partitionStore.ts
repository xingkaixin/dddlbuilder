import { create } from 'zustand';
import type { MysqlPartitionConfig, MysqlPartitionType, PartitionDefinition } from '@ddlbuilder/shared-types';
import { replaceIdentifierToken } from '@/utils/fieldRenameUtils';

type Setter<T> = T | ((prev: T) => T);

const DEFAULT_CONFIG: MysqlPartitionConfig = {
  enabled: false,
  type: 'RANGE',
  columns: [],
  partitionCount: 4,
  partitions: [],
};

interface PartitionStoreState {
  mysqlPartitionConfig: MysqlPartitionConfig;
  hydratedFromPersisted: boolean;
  setPartitionEnabled: (enabled: boolean) => void;
  setPartitionType: (type: MysqlPartitionType) => void;
  setPartitionColumns: (columns: string[]) => void;
  setPartitionExpression: (expression: string) => void;
  setPartitionCount: (count: number) => void;
  addPartition: (partition: PartitionDefinition) => void;
  removePartition: (name: string) => void;
  updatePartition: (name: string, partition: PartitionDefinition) => void;
  generateRangePartitions: (preset: 'year' | 'month' | 'day') => void;
  syncFieldRename: (oldFieldName: string, newFieldName: string) => void;
  setMysqlPartitionConfig: (value: Setter<MysqlPartitionConfig>) => void;
  markHydratedFromPersisted: () => void;
  resetPartition: () => void;
}

export const usePartitionStore = create<PartitionStoreState>((set) => ({
  mysqlPartitionConfig: DEFAULT_CONFIG,
  hydratedFromPersisted: false,
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
        partitionCount: Math.max(1, count),
      },
    })),
  addPartition: (partition) =>
    set((state) => ({
      mysqlPartitionConfig: {
        ...state.mysqlPartitionConfig,
        partitions: [...(state.mysqlPartitionConfig.partitions || []), partition],
      },
    })),
  removePartition: (name) =>
    set((state) => ({
      mysqlPartitionConfig: {
        ...state.mysqlPartitionConfig,
        partitions: (state.mysqlPartitionConfig.partitions || []).filter(
          (partition) => partition.name !== name,
        ),
      },
    })),
  updatePartition: (name, partition) =>
    set((state) => ({
      mysqlPartitionConfig: {
        ...state.mysqlPartitionConfig,
        partitions: (state.mysqlPartitionConfig.partitions || []).map((current) =>
          current.name === name ? partition : current,
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
  syncFieldRename: (oldFieldName, newFieldName) => {
    if (!oldFieldName || !newFieldName || oldFieldName === newFieldName) {
      return;
    }

    set((state) => ({
      mysqlPartitionConfig: {
        ...state.mysqlPartitionConfig,
        columns: state.mysqlPartitionConfig.columns.map((column) =>
          replaceIdentifierToken(column, oldFieldName, newFieldName),
        ),
        expression: state.mysqlPartitionConfig.expression
          ? replaceIdentifierToken(
              state.mysqlPartitionConfig.expression,
              oldFieldName,
              newFieldName,
            )
          : undefined,
      },
    }));
  },
  setMysqlPartitionConfig: (value) =>
    set((state) => ({
      mysqlPartitionConfig: typeof value === 'function' ? value(state.mysqlPartitionConfig) : value,
    })),
  markHydratedFromPersisted: () =>
    set({
      hydratedFromPersisted: true,
    }),
  resetPartition: () =>
    set({
      mysqlPartitionConfig: DEFAULT_CONFIG,
      hydratedFromPersisted: false,
    }),
}));
