import { useState, useCallback, useEffect } from 'react';
import type {
  CitusTableMode,
  CitusShardingConfig,
  PersistedState,
} from '@/types';

export interface UseCitusShardingReturn {
  citusShardingConfig: CitusShardingConfig;
  setCitusMode: (mode: CitusTableMode) => void;
  setDistributionColumn: (column: string | undefined) => void;
  setCitusShardingConfig: React.Dispatch<
    React.SetStateAction<CitusShardingConfig>
  >;
  resetCitusSharding: () => void;
}

const DEFAULT_CONFIG: CitusShardingConfig = {
  mode: 'reference',
  distributionColumn: undefined,
};

export function useCitusSharding(
  persistedState?: Pick<PersistedState, 'citusShardingConfig'>,
): UseCitusShardingReturn {
  const [citusShardingConfig, setCitusShardingConfig] =
    useState<CitusShardingConfig>(DEFAULT_CONFIG);
  const [initialized, setInitialized] = useState(false);

  // Restore from persisted state
  useEffect(() => {
    if (persistedState?.citusShardingConfig && !initialized) {
      setCitusShardingConfig(persistedState.citusShardingConfig);
      setInitialized(true);
    }
  }, [persistedState, initialized]);

  const setCitusMode = useCallback((mode: CitusTableMode) => {
    setCitusShardingConfig((prev) => ({
      ...prev,
      mode,
      // 切换为副本表时清空分片字段
      distributionColumn:
        mode === 'reference' ? undefined : prev.distributionColumn,
    }));
  }, []);

  const setDistributionColumn = useCallback((column: string | undefined) => {
    setCitusShardingConfig((prev) => ({
      ...prev,
      distributionColumn: column,
    }));
  }, []);

  const resetCitusSharding = useCallback(() => {
    setCitusShardingConfig(DEFAULT_CONFIG);
  }, []);

  return {
    citusShardingConfig,
    setCitusMode,
    setDistributionColumn,
    setCitusShardingConfig,
    resetCitusSharding,
  };
}
