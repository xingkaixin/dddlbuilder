import { normalizePersistedRows, type PersistedState } from '@ddlbuilder/shared-types';
import type { SavedTableDraftRecord, WorkspaceSelection } from '@ddlbuilder/shared-types/workspace';
import { serializePersistedStateForComparison } from '@/utils/persistedStateSignature';

interface SavedTableSnapshotRecord {
  normalizedName: string;
  name: string;
  state: PersistedState;
}

const normalizeBaseSignature = (baseSignature: string) => {
  try {
    return serializePersistedStateForComparison(
      normalizePersistedRows(JSON.parse(baseSignature) as PersistedState),
    );
  } catch {
    return baseSignature;
  }
};

export const resolveSavedTableSnapshot = (
  record: SavedTableSnapshotRecord,
  draft: SavedTableDraftRecord | null,
): {
  source: Extract<WorkspaceSelection, { kind: 'saved_table' }>;
  state: PersistedState;
} => {
  const baseSignature = serializePersistedStateForComparison(record.state);
  const state =
    draft && normalizeBaseSignature(draft.baseSignature) === baseSignature
      ? draft.state
      : record.state;

  return {
    source: {
      kind: 'saved_table',
      normalizedName: record.normalizedName,
      tableName: record.name,
      baseSignature,
    },
    state,
  };
};
