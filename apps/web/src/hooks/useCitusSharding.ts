import type { CitusTableMode, CitusShardingConfig } from '@ddlbuilder/shared-types';
import { useShardingStore } from '@/stores';

export interface UseCitusShardingReturn {
  citusShardingConfig: CitusShardingConfig;
  setCitusMode: (mode: CitusTableMode) => void;
  setDistributionColumn: (column: string | undefined) => void;
  setCitusShardingConfig: React.Dispatch<React.SetStateAction<CitusShardingConfig>>;
  resetCitusSharding: () => void;
}

export function useCitusSharding(): UseCitusShardingReturn {
  const citusShardingConfig = useShardingStore((state) => state.citusShardingConfig);
  const setCitusMode = useShardingStore((state) => state.setCitusMode);
  const setDistributionColumn = useShardingStore((state) => state.setDistributionColumn);
  const setCitusShardingConfig = useShardingStore((state) => state.setCitusShardingConfig);
  const resetCitusSharding = useShardingStore((state) => state.resetCitusSharding);

  return {
    citusShardingConfig,
    setCitusMode,
    setDistributionColumn,
    setCitusShardingConfig,
    resetCitusSharding,
  };
}
