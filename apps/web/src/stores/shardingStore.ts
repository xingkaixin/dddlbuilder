import type { CitusShardingConfig } from '@ddlbuilder/shared-types';
import { isSameIdentifierToken } from '@/utils/fieldRenameUtils';
import type { EditorSetState, ShardingSlice } from './editorStoreTypes';

export const DEFAULT_SHARDING_CONFIG: CitusShardingConfig = {
  mode: 'reference',
  distributionColumn: undefined,
};

export const createShardingSlice = (set: EditorSetState): ShardingSlice => ({
  citusShardingConfig: DEFAULT_SHARDING_CONFIG,
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
  syncShardingFieldRename: (oldFieldName, newFieldName) =>
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
  resetCitusSharding: () =>
    set({
      citusShardingConfig: DEFAULT_SHARDING_CONFIG,
    }),
});
