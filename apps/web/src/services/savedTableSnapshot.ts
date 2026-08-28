import { withDefaultEditorSession, type PersistedState } from '@ddlbuilder/shared-types';
import type { SavedTableDraftRecord, WorkspaceSelection } from '@ddlbuilder/shared-types/workspace';
import { serializePersistedStateForComparison } from '@/utils/persistedStateSignature';
import { mergeSchemaStates } from './schemaStateMerge';

interface SavedTableSnapshotRecord {
  tableId?: string;
  normalizedName: string;
  name: string;
  state: PersistedState;
}

export const resolveSavedTableSnapshot = (
  record: SavedTableSnapshotRecord,
  draft: SavedTableDraftRecord | null,
): {
  source: Extract<WorkspaceSelection, { kind: 'saved_table' }>;
  state: PersistedState;
} => {
  const baseSignature = serializePersistedStateForComparison(record.state);
  let state = draft?.state ?? record.state;
  if (draft && draft.baseSignature !== baseSignature) {
    const base = draft.baseState ? withDefaultEditorSession(draft.baseState) : null;
    // 未保存的修改优先；缺少可读基线时保留草稿，不能将无法合并视为可以丢弃。
    if (base) state = mergeSchemaStates(base, record.state, draft.state);
  }

  return {
    source: {
      kind: 'saved_table',
      ...(record.tableId ? { tableId: record.tableId } : {}),
      normalizedName: record.normalizedName,
      tableName: record.name,
      baseSignature,
    },
    state,
  };
};
