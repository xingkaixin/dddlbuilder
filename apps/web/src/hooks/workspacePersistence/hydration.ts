import { type SavedTableTarget } from '@ddlbuilder/shared-types/workspace';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type {
  DraftSummary,
  SavedTableDraftRecord,
  WorkspaceSelection,
} from '@ddlbuilder/shared-types/workspace';
import { resolveSavedTableSnapshot } from '@/services/savedTableSnapshot';
import type { SavedTableRecord } from '@/utils/workspaceStorageTypes';
import { DEFAULT_DRAFT_ID, type WorkspaceSessionRecord } from '@/utils/workspaceStateDb';
import { serializePersistedStateForComparison } from '@/utils/persistedStateSignature';
import { buildDraftSummary, normalizeGlobalDraftRecord, type GlobalDraftRecord } from './normalize';

export type DraftEntry = { draftId: string; record: GlobalDraftRecord };

/** Hydration 只关心已保存表的这几个字段，屏蔽 Y.Doc / IndexedDB 两种数据源的形状差异 */
export type HydrationSavedTable = {
  tableId?: string;
  normalizedName: string;
  tableName: string;
  state: PersistedState;
  draftState?: PersistedState | null;
};

export type WorkspaceHydration = {
  activeSource: WorkspaceSelection;
  state: PersistedState | null;
};

export const toDraftSummary = (draftId: string, record: GlobalDraftRecord): DraftSummary =>
  buildDraftSummary(
    draftId,
    record.state,
    record.createdAt ?? record.updatedAt,
    record.updatedAt,
    record.folderId,
    record.trashedAt,
  );

export const pickInitialDraft = (drafts: DraftEntry[]): DraftEntry | null =>
  drafts.find((draft) => draft.draftId === DEFAULT_DRAFT_ID) ??
  [...drafts].sort(
    (a, b) =>
      (b.record.createdAt ?? b.record.updatedAt) - (a.record.createdAt ?? a.record.updatedAt),
  )[0] ??
  null;

export const collectBootstrapDrafts = (bootstrap: {
  globalDraft: unknown;
  drafts: Array<{ draftId: string; record: unknown }>;
}): DraftEntry[] => {
  const entries: DraftEntry[] = [];
  const defaultRecord = normalizeGlobalDraftRecord(bootstrap.globalDraft);
  if (defaultRecord) {
    entries.push({ draftId: DEFAULT_DRAFT_ID, record: defaultRecord });
  }
  if (!Array.isArray(bootstrap.drafts)) return entries;

  for (const item of bootstrap.drafts) {
    if (!item || typeof item.draftId !== 'string' || item.draftId === DEFAULT_DRAFT_ID) continue;
    if (!item.record || typeof item.record !== 'object') continue;
    const record = normalizeGlobalDraftRecord(item.record);
    if (record) {
      entries.push({ draftId: item.draftId, record });
    }
  }
  return entries;
};

export const toHydrationSavedTable = (
  value: unknown,
  draft?: SavedTableDraftRecord | null,
): HydrationSavedTable | null => {
  if (!value) return null;
  const record = value as SavedTableRecord;
  return {
    tableId: record.tableId,
    normalizedName: record.normalizedName,
    tableName: record.name ?? '',
    state: record.state,
    ...(draft ? { draftState: resolveSavedTableSnapshot(record, draft).state } : {}),
  };
};

export const resolveWorkspaceHydration = ({
  drafts,
  session,
  findSavedTable,
}: {
  drafts: DraftEntry[];
  session: WorkspaceSessionRecord | null;
  findSavedTable: (normalizedName: SavedTableTarget) => HydrationSavedTable | null;
}): WorkspaceHydration => {
  const initialDraft = pickInitialDraft(drafts);
  const initialHydration = (): WorkspaceHydration => ({
    activeSource: { kind: 'draft', draftId: initialDraft?.draftId ?? DEFAULT_DRAFT_ID },
    state: initialDraft?.record.state ?? null,
  });

  if (!session) return initialHydration();

  if (session.activeSource.kind === 'saved_table') {
    const savedTable = findSavedTable(session.activeSource);
    if (!savedTable) return initialHydration();
    return {
      activeSource: {
        kind: 'saved_table',
        ...(savedTable.tableId ? { tableId: savedTable.tableId } : {}),
        normalizedName: savedTable.normalizedName,
        tableName: savedTable.tableName,
        baseSignature: serializePersistedStateForComparison(savedTable.state),
      },
      state: savedTable.draftState ?? session.activeState ?? savedTable.state,
    };
  }

  const { draftId } = session.activeSource;
  const resolvedDraft = drafts.find((draft) => draft.draftId === draftId) ?? initialDraft;
  return {
    activeSource: { kind: 'draft', draftId: resolvedDraft?.draftId ?? draftId },
    state: resolvedDraft?.record.state ?? session.activeState ?? null,
  };
};
