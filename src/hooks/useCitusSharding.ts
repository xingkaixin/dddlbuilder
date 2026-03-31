import { useEffect } from 'react';
import type { CitusTableMode, CitusShardingConfig, PersistedState } from '@/types';
import { useShardingStore } from '@/stores';

export interface UseCitusShardingReturn {
  citusShardingConfig: CitusShardingConfig;
  setCitusMode: (mode: CitusTableMode) => void;
  setDistributionColumn: (column: string | undefined) => void;
  setCitusShardingConfig: React.Dispatch<React.SetStateAction<CitusShardingConfig>>;
  resetCitusSharding: () => void;
}

export function useCitusSharding(
  persistedState?: Pick<PersistedState, 'citusShardingConfig'>,
): UseCitusShardingReturn {
  const citusShardingConfig = useShardingStore((state) => state.citusShardingConfig);
  const setCitusMode = useShardingStore((state) => state.setCitusMode);
  const setDistributionColumn = useShardingStore((state) => state.setDistributionColumn);
  const setCitusShardingConfig = useShardingStore((state) => state.setCitusShardingConfig);
  const hydratedFromPersisted = useShardingStore((state) => state.hydratedFromPersisted);
  const markHydratedFromPersisted = useShardingStore((state) => state.markHydratedFromPersisted);
  const resetCitusSharding = useShardingStore((state) => state.resetCitusSharding);

  useEffect(() => {
    if (!persistedState?.citusShardingConfig || hydratedFromPersisted) return;
    setCitusShardingConfig(persistedState.citusShardingConfig);
    markHydratedFromPersisted();
  }, [hydratedFromPersisted, markHydratedFromPersisted, persistedState, setCitusShardingConfig]);

  return {
    citusShardingConfig,
    setCitusMode,
    setDistributionColumn,
    setCitusShardingConfig,
    resetCitusSharding,
  };
}
