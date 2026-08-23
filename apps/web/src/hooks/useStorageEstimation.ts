import { useState, useMemo } from 'react';
import type { DatabaseType, IndexDefinition, NormalizedField } from '@ddlbuilder/shared-types';
import {
  estimateStorage,
  estimateStorageBreakdown,
  type StorageBreakdown,
  type StorageResult,
} from '@ddlbuilder/ddl-core';

interface SizeDisplay {
  value: number;
  unit: string;
}

const SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

function formatSizeDisplay(bytes: number): SizeDisplay {
  if (bytes === 0) return { value: 0, unit: 'B' };

  const k = 1024;
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), SIZE_UNITS.length - 1);
  const value = Number.parseFloat((bytes / k ** unitIndex).toFixed(2));

  return {
    value,
    unit: SIZE_UNITS[unitIndex],
  };
}

function formatSizeText(display: SizeDisplay): string {
  return `${display.value} ${display.unit}`;
}

export function useStorageEstimation(
  dbType: DatabaseType,
  fields: NormalizedField[],
  indexes: IndexDefinition[] = [],
  storageFormat?: string,
) {
  const [estimateRows, setEstimateRows] = useState<number>(10000);

  // Legacy result kept for backward compatibility
  const result = useMemo<StorageResult>(() => {
    return estimateStorage(dbType, fields, storageFormat);
  }, [dbType, fields, storageFormat]);

  const breakdown = useMemo<StorageBreakdown>(() => {
    return estimateStorageBreakdown(dbType, fields, indexes, storageFormat);
  }, [dbType, fields, indexes, storageFormat]);

  const rawDataBytes = useMemo(
    () => breakdown.rawDataPerRow * estimateRows,
    [breakdown.rawDataPerRow, estimateRows],
  );

  const indexBytes = useMemo(
    () => breakdown.indexPerRow * estimateRows,
    [breakdown.indexPerRow, estimateRows],
  );

  const redundancyBytes = useMemo(
    () => breakdown.redundancyPerRow * estimateRows,
    [breakdown.redundancyPerRow, estimateRows],
  );

  const totalSize = useMemo(() => {
    return breakdown.totalPerRow * estimateRows;
  }, [breakdown.totalPerRow, estimateRows]);

  const rowSizeDisplay = useMemo(
    () => formatSizeDisplay(result.totalRowSize),
    [result.totalRowSize],
  );
  const totalSizeDisplay = useMemo(() => formatSizeDisplay(totalSize), [totalSize]);

  return {
    estimateRows,
    setEstimateRows,
    result,
    breakdown,
    rawDataBytes,
    indexBytes,
    redundancyBytes,
    totalSize,
    totalSizeFormatted: formatSizeText(totalSizeDisplay),
    rowSizeFormatted: formatSizeText(rowSizeDisplay),
    rowSizeDisplay,
    totalSizeDisplay,
  };
}
