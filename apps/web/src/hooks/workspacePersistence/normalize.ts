import type { PersistedState } from '@ddlbuilder/shared-types';
import type { DraftSummary, WorkspaceSource } from '@ddlbuilder/shared-types/workspace';
import { decodePersistedState } from '@ddlbuilder/workspace-core';
import type { WorkspaceDraftRecord, WorkspaceSessionRecord } from '@/utils/workspaceStateDb';

export type GlobalDraftRecord = WorkspaceDraftRecord;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toNumber = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

export const normalizePersistedState = (value: unknown) => decodePersistedState(value);

export const isWorkspaceSource = (value: unknown): value is WorkspaceSource => {
  if (!isRecord(value) || typeof value.kind !== 'string') return false;
  if (value.kind === 'draft') return typeof value.draftId === 'string' && value.draftId.length > 0;
  if (value.kind !== 'saved_table') return false;
  return (
    typeof value.normalizedName === 'string' &&
    value.normalizedName.length > 0 &&
    typeof value.tableName === 'string' &&
    typeof value.baseSignature === 'string'
  );
};

export const isSameWorkspaceSource = (a: WorkspaceSource, b: WorkspaceSource) => {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'draft' && b.kind === 'draft') {
    return a.draftId === b.draftId;
  }
  if (a.kind === 'saved_table' && b.kind === 'saved_table') {
    return (
      a.normalizedName === b.normalizedName &&
      a.tableName === b.tableName &&
      a.baseSignature === b.baseSignature
    );
  }
  return false;
};

/** 持久化数据里的默认草稿名，随界面语言变化会污染已存数据，因此不接入 i18n */
export const UNTITLED_DRAFT_NAME = '未命名草稿';

export const getDraftDisplayName = (state: PersistedState) =>
  state.tableName.trim() || UNTITLED_DRAFT_NAME;

export const resolveUniqueDraftName = (baseName: string, takenNames: ReadonlySet<string>) => {
  if (!takenNames.has(baseName)) return baseName;
  let counter = 1;
  while (takenNames.has(`${baseName}_${counter}`)) {
    counter++;
  }
  return `${baseName}_${counter}`;
};

export const buildDraftSummary = (
  draftId: string,
  state: PersistedState,
  createdAt: number,
  updatedAt: number,
  folderId?: string,
  trashedAt?: number,
): DraftSummary => ({
  draftId,
  name: getDraftDisplayName(state),
  dbType: state.dbType,
  fieldCount: state.rows.filter((row) => row.fieldName?.trim()).length,
  createdAt,
  updatedAt,
  folderId,
  trashedAt,
});

export const normalizeGlobalDraftRecord = (value: unknown): GlobalDraftRecord | null => {
  if (!isRecord(value)) return null;
  const state = normalizePersistedState(value.state);
  if (!state) return null;

  return {
    createdAt: toNumber(value.createdAt, toNumber(value.updatedAt, Date.now())),
    updatedAt: toNumber(value.updatedAt, Date.now()),
    state,
  };
};

export const normalizeWorkspaceSession = (value: unknown): WorkspaceSessionRecord | null => {
  if (!isRecord(value)) return null;
  if (!isWorkspaceSource(value.activeSource)) return null;

  return {
    activeSource: value.activeSource,
    activeState: normalizePersistedState(value.activeState),
    updatedAt: toNumber(value.updatedAt, Date.now()),
  };
};
