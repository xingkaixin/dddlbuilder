import { useAppSelectors } from './useAppSelectors';
import { useSuggestionAnimation } from '@/hooks/useSuggestionAnimation';
import { useTableOptions } from '@/hooks/useTableOptions';
import { useEditorStore } from '@/stores';
import { useShallow } from 'zustand/react/shallow';

export function useEditorDomains() {
  const editor = useAppSelectors();
  const auth = useEditorStore(
    useShallow((state) => ({
      authInput: state.authInput,
      authObjects: state.authObjects,
      setAuthInput: state.setAuthInput,
      addAuthObject: state.addAuthObject,
      removeAuthObject: state.removeAuthObject,
      resetAuthState: state.resetAuthState,
    })),
  );
  const sharding = useEditorStore(
    useShallow((state) => ({
      citusShardingConfig: state.citusShardingConfig,
      setCitusMode: state.setCitusMode,
      setDistributionColumn: state.setDistributionColumn,
      setCitusShardingConfig: state.setCitusShardingConfig,
      resetCitusSharding: state.resetCitusSharding,
    })),
  );
  const partition = useEditorStore(
    useShallow((state) => ({
      mysqlPartitionConfig: state.mysqlPartitionConfig,
      setPartitionEnabled: state.setPartitionEnabled,
      setPartitionType: state.setPartitionType,
      setPartitionColumns: state.setPartitionColumns,
      setPartitionExpression: state.setPartitionExpression,
      setPartitionCount: state.setPartitionCount,
      addPartition: state.addPartition,
      removePartition: state.removePartition,
      updatePartition: state.updatePartition,
      generateRangePartitions: state.generateRangePartitions,
      resetPartition: state.resetPartition,
    })),
  );

  return {
    editor,
    auth,
    sharding,
    animations: useSuggestionAnimation(),
    partition,
    tableOptions: useTableOptions(),
  };
}
