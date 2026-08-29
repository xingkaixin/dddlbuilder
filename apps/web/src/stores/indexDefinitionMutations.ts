import type { IndexDefinition } from '@ddlbuilder/shared-types';

export type IndexWriteFailure = 'duplicate-name' | 'primary-exists' | 'not-found';

export type IndexWriteResult =
  | { ok: true; indexes: IndexDefinition[] }
  | { ok: false; reason: IndexWriteFailure };

const findConflict = (
  indexes: IndexDefinition[],
  candidate: IndexDefinition,
): IndexWriteFailure | null => {
  if (
    indexes.some(
      (index) =>
        index.id !== candidate.id &&
        index.name.trim().toLowerCase() === candidate.name.trim().toLowerCase(),
    )
  ) {
    return 'duplicate-name';
  }
  if (
    candidate.kind === 'primary' &&
    indexes.some((index) => index.id !== candidate.id && index.kind === 'primary')
  ) {
    return 'primary-exists';
  }
  return null;
};

export const insertIndexDefinition = (
  indexes: IndexDefinition[],
  candidate: IndexDefinition,
): IndexWriteResult => {
  const reason = findConflict(indexes, candidate);
  return reason ? { ok: false, reason } : { ok: true, indexes: [...indexes, candidate] };
};

export const replaceIndexDefinition = (
  indexes: IndexDefinition[],
  candidate: IndexDefinition,
): IndexWriteResult => {
  if (!indexes.some((index) => index.id === candidate.id)) {
    return { ok: false, reason: 'not-found' };
  }
  const reason = findConflict(indexes, candidate);
  return reason
    ? { ok: false, reason }
    : {
        ok: true,
        indexes: indexes.map((index) => (index.id === candidate.id ? candidate : index)),
      };
};

export const describeIndexWriteFailure = (
  reason: IndexWriteFailure,
  candidate: IndexDefinition,
) => {
  if (reason === 'duplicate-name') return `Duplicate index name: ${candidate.name}`;
  if (reason === 'primary-exists') return 'Primary index already exists';
  return `Index not found: ${candidate.id}`;
};
