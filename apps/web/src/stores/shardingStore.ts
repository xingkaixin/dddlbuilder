import { create } from 'zustand';
import type { CitusShardingConfig, CitusTableMode } from '@ddlbuilder/shared-types';
import { isSameIdentifierToken } from '@/utils/fieldRenameUtils';

type Setter<T> = T | ((prev: T) => T);

const DEFAULT_CONFIG: CitusShardingConfig = {
  mode: 'reference',
  distributionColumn: undefined,
};

interface ShardingStoreState {
  citusShardingConfig: CitusShardingConfig;
  hydratedFromPersisted: boolean;
  setCitusMode: (mode: CitusTableMode) => void;
  setDistributionColumn: (column: string | undefined) => void;
  syncFieldRename: (oldFieldName: string, newFieldName: string) => void;
  setCitusShardingConfig: (value: Setter<CitusShardingConfig>) => void;
  markHydratedFromPersisted: () => void;
  resetCitusSharding: () => void;
}

export const useShardingStore = create<ShardingStoreState>((set) => ({
  citusShardingConfig: DEFAULT_CONFIG,
  hydratedFromPersisted: false,
  setCitusMode: (mode) =>
    set((state) => ({
      citusShardingConfig: {
        ...state.citusShardingConfig,
        mode,
        distributionColumn:
          mode === 'reference' ? undefined : state.citusShardingConfig.distributionColumn,
      },
    })),
  setDistributionColumn: (column) =>
    set((state) => ({
      citusShardingConfig: {
        ...state.citusShardingConfig,
        distributionColumn: column,
      },
    })),
  syncFieldRename: (oldFieldName, newFieldName) =>
    set((state) => ({
      citusShardingConfig: {
        ...state.citusShardingConfig,
        distributionColumn:
          state.citusShardingConfig.distributionColumn &&
          isSameIdentifierToken(state.citusShardingConfig.distributionColumn, oldFieldName)
            ? newFieldName
            : state.citusShardingConfig.distributionColumn,
      },
    })),
  setCitusShardingConfig: (value) =>
    set((state) => ({
      citusShardingConfig: typeof value === 'function' ? value(state.citusShardingConfig) : value,
    })),
  markHydratedFromPersisted: () =>
    set({
      hydratedFromPersisted: true,
    }),
  resetCitusSharding: () =>
    set({
      citusShardingConfig: DEFAULT_CONFIG,
      hydratedFromPersisted: false,
    }),
}));
