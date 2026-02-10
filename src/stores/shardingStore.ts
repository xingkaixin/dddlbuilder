import { create } from 'zustand';
import type { CitusShardingConfig, CitusTableMode } from '@/types';

type Setter<T> = T | ((prev: T) => T);

const DEFAULT_CONFIG: CitusShardingConfig = {
  mode: 'reference',
  distributionColumn: undefined,
};

interface ShardingStoreState {
  citusShardingConfig: CitusShardingConfig;
  setCitusMode: (mode: CitusTableMode) => void;
  setDistributionColumn: (column: string | undefined) => void;
  setCitusShardingConfig: (value: Setter<CitusShardingConfig>) => void;
  resetCitusSharding: () => void;
}

export const useShardingStore = create<ShardingStoreState>((set) => ({
  citusShardingConfig: DEFAULT_CONFIG,
  setCitusMode: (mode) =>
    set((state) => ({
      citusShardingConfig: {
        ...state.citusShardingConfig,
        mode,
        distributionColumn:
          mode === 'reference'
            ? undefined
            : state.citusShardingConfig.distributionColumn,
      },
    })),
  setDistributionColumn: (column) =>
    set((state) => ({
      citusShardingConfig: {
        ...state.citusShardingConfig,
        distributionColumn: column,
      },
    })),
  setCitusShardingConfig: (value) =>
    set((state) => ({
      citusShardingConfig:
        typeof value === 'function' ? value(state.citusShardingConfig) : value,
    })),
  resetCitusSharding: () =>
    set({
      citusShardingConfig: DEFAULT_CONFIG,
    }),
}));
