import type { PersistedState } from '@ddlbuilder/shared-types';
import {
  ensureSavedTableName,
  normalizeSavedTableName,
  type SavedTableRecord,
} from './savedTablesDb';

export type SavedTableConflictStrategy = 'skip' | 'overwrite' | 'rename';

export interface SavedTableImportItem {
  name: string;
  state: PersistedState;
}

export interface SavedTableBatchImportRequest {
  items: SavedTableImportItem[];
  conflictStrategy: SavedTableConflictStrategy;
  folderId?: string;
}

export interface SavedTableBatchImportResult {
  successCount: number;
  skipCount: number;
  failCount: number;
}

interface SavedTableBatchImportPlan {
  records: SavedTableRecord[];
  successCount: number;
  skipCount: number;
}

const createUniqueIdentity = (name: string, occupiedNames: Set<string>) => {
  let suffix = 1;
  let displayName = name;
  let normalizedName = normalizeSavedTableName(displayName);

  while (occupiedNames.has(normalizedName)) {
    displayName = `${name}_${suffix}`;
    normalizedName = normalizeSavedTableName(displayName);
    suffix += 1;
  }

  return { displayName, normalizedName };
};

export const buildSavedTableBatchImportPlan = (
  request: SavedTableBatchImportRequest,
  existingRecords: SavedTableRecord[],
  now: number,
): SavedTableBatchImportPlan => {
  const recordsByName = new Map(
    existingRecords.map((record) => [record.normalizedName, record] as const),
  );
  const occupiedNames = new Set(existingRecords.map((record) => record.normalizedName));
  const pendingRecords = new Map<string, SavedTableRecord>();
  let successCount = 0;
  let skipCount = 0;

  for (const item of request.items) {
    const displayName = ensureSavedTableName(item.name);
    const normalizedName = normalizeSavedTableName(displayName);
    const existing = pendingRecords.get(normalizedName) ?? recordsByName.get(normalizedName);
    const hasActiveConflict = Boolean(existing && !existing.trashedAt);

    if (hasActiveConflict && request.conflictStrategy === 'skip') {
      skipCount += 1;
      continue;
    }

    if (hasActiveConflict && request.conflictStrategy === 'rename') {
      const uniqueIdentity = createUniqueIdentity(displayName, occupiedNames);
      const record: SavedTableRecord = {
        normalizedName: uniqueIdentity.normalizedName,
        name: uniqueIdentity.displayName,
        state: item.state,
        folderId: request.folderId,
        createdAt: now,
        updatedAt: now,
      };
      pendingRecords.set(record.normalizedName, record);
      occupiedNames.add(record.normalizedName);
      successCount += 1;
      continue;
    }

    const record: SavedTableRecord = {
      normalizedName,
      name: hasActiveConflict ? (existing?.name ?? displayName) : displayName,
      state: item.state,
      folderId: request.folderId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    pendingRecords.set(normalizedName, record);
    occupiedNames.add(normalizedName);
    successCount += 1;
  }

  return {
    records: [...pendingRecords.values()],
    successCount,
    skipCount,
  };
};
