import type { TableMiscConfig } from './index.js';

const clampInteger = (value: unknown, minimum: number, maximum: number, fallback: number) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(value)));
};

const clampOptionalInteger = (value: unknown, minimum: number, maximum: number) =>
  typeof value === 'number' && Number.isFinite(value)
    ? clampInteger(value, minimum, maximum, minimum)
    : undefined;

export const normalizeAddCount = (value: unknown): number => clampInteger(value, 1, 100, 10);

export const normalizeFreezeColumns = (value: unknown): number => clampInteger(value, 0, 8, 0);

export const normalizeMysqlPartitionCount = (value: unknown): number =>
  clampInteger(value, 1, 8192, 4);

export const normalizeOptionalMysqlPartitionCount = (value: unknown): number | undefined =>
  clampOptionalInteger(value, 1, 8192);

export const normalizeHiveBucketCount = (value: unknown): number => clampInteger(value, 1, 8192, 1);

export const normalizeFillfactor = (value: unknown): number | undefined =>
  clampOptionalInteger(value, 10, 100);

export const normalizePctfree = (value: unknown): number | undefined =>
  clampOptionalInteger(value, 0, 99);

export const normalizeInitrans = (value: unknown): number | undefined =>
  clampOptionalInteger(value, 1, 255);

export const normalizeTableMiscConfigNumbers = (config: TableMiscConfig): TableMiscConfig => {
  const normalized = {
    ...config,
    fillfactor: normalizeFillfactor(config.fillfactor),
    pctfree: normalizePctfree(config.pctfree),
    initrans: normalizeInitrans(config.initrans),
    ...(config.partitions
      ? {
          partitions: {
            ...config.partitions,
            ...(config.partitions.clustering
              ? {
                  clustering: {
                    ...config.partitions.clustering,
                    bucketCount: normalizeHiveBucketCount(config.partitions.clustering.bucketCount),
                  },
                }
              : {}),
          },
        }
      : {}),
  };
  if (normalized.fillfactor === undefined) delete normalized.fillfactor;
  if (normalized.pctfree === undefined) delete normalized.pctfree;
  if (normalized.initrans === undefined) delete normalized.initrans;
  return normalized;
};
