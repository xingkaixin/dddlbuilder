import type {
  WorkspaceMigrationPayload,
  WorkspaceMigrationSnapshot,
  WorkspaceSource,
} from '@ddlbuilder/shared-types/workspace';
import { decodePersistedState, decodeWorkspaceSnapshot } from './persistedStateCodec';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readRequiredText = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value : null;

const decodeWorkspaceSource = (value: unknown): WorkspaceSource | null => {
  if (!isRecord(value)) return null;
  if (value.kind === 'draft') {
    const draftId = readRequiredText(value.draftId);
    return draftId ? { kind: 'draft', draftId } : null;
  }
  if (value.kind === 'saved_table') {
    const normalizedName = readRequiredText(value.normalizedName);
    return normalizedName
      ? {
          kind: 'saved_table',
          normalizedName,
          ...(typeof value.tableId === 'string' ? { tableId: value.tableId } : {}),
        }
      : null;
  }
  return null;
};

const decodeActiveSession = (
  value: unknown,
): WorkspaceMigrationSnapshot['activeSession'] | undefined => {
  if (value === null) return null;
  if (
    !isRecord(value) ||
    typeof value.updatedAt !== 'number' ||
    !Number.isFinite(value.updatedAt)
  ) {
    return undefined;
  }

  const activeSource = decodeWorkspaceSource(value.activeSource);
  if (!activeSource) return undefined;
  if (value.activeState === null) {
    return { activeSource, activeState: null, updatedAt: value.updatedAt };
  }

  const activeState = decodePersistedState(value.activeState, 'external');
  return activeState ? { activeSource, activeState, updatedAt: value.updatedAt } : undefined;
};

export const decodeWorkspaceMigrationPayload = (
  value: unknown,
): WorkspaceMigrationPayload | null => {
  if (!isRecord(value) || !isRecord(value.snapshot)) return null;

  const localFingerprint = readRequiredText(value.localFingerprint);
  const idempotencyKey = readRequiredText(value.idempotencyKey);
  if (!localFingerprint || !idempotencyKey) return null;

  const snapshotInput = value.snapshot;
  const snapshot = decodeWorkspaceSnapshot({
    ...snapshotInput,
    drafts: snapshotInput.drafts ?? [],
    folders: snapshotInput.folders ?? [],
  });
  const activeSession = decodeActiveSession(snapshotInput.activeSession);
  if (!snapshot || activeSession === undefined) return null;

  return {
    localFingerprint,
    idempotencyKey,
    snapshot: { ...snapshot, activeSession },
  };
};
