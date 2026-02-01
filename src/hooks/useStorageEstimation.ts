import { useState, useMemo } from 'react';
import type { DatabaseType, NormalizedField } from '@/types';
import { estimateStorage, type StorageResult } from '@/utils/storageEstimator';

export function useStorageEstimation(
  dbType: DatabaseType,
  fields: NormalizedField[],
) {
  const [estimateRows, setEstimateRows] = useState<number>(10000);

  const result = useMemo<StorageResult>(() => {
    return estimateStorage(dbType, fields);
  }, [dbType, fields]);

  const totalSize = useMemo(() => {
    return result.totalRowSize * estimateRows;
  }, [result, estimateRows]);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / k ** i).toFixed(2)) + ' ' + sizes[i];
  };

  return {
    estimateRows,
    setEstimateRows,
    result,
    totalSize,
    totalSizeFormatted: formatSize(totalSize),
    rowSizeFormatted: formatSize(result.totalRowSize),
  };
}
