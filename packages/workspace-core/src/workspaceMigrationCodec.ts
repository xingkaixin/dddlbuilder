/* oxlint-disable anti-slop/no-runtime-typeof -- This module decodes the raw migration payload before domain use. */
/* oxlint-disable anti-slop/no-unknown-parameters -- Migration input is an external persisted payload. */

import type {
  WorkspaceMigrationPayload,
  WorkspaceMigrationSnapshot,
  WorkspaceSource,
} from '@ddlbuilder/shared-types/workspace';
import { decodePersistedState, decodeWorkspaceSnapshot } from './persistedStateCodec';
import { isRecord } from './yMapJson';

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

export const decodeWorkspaceMigrationSnapshot = (
  value: unknown,
): WorkspaceMigrationSnapshot | null => {
  if (!isRecord(value)) return null;

  const snapshot = decodeWorkspaceSnapshot({
    ...value,
    drafts: value.drafts ?? [],
    folders: value.folders ?? [],
  });
  const activeSession = decodeActiveSession(value.activeSession);

  if (!snapshot || activeSession === undefined) return null;

  return { ...snapshot, activeSession };
};

export const decodeWorkspaceMigrationPayload = (
  value: unknown,
): WorkspaceMigrationPayload | null => {
  if (!isRecord(value)) return null;

  const localFingerprint = readRequiredText(value.localFingerprint);
  const idempotencyKey = readRequiredText(value.idempotencyKey);
  const snapshot = decodeWorkspaceMigrationSnapshot(value.snapshot);

  if (!localFingerprint || !idempotencyKey || !snapshot) return null;

  return {
    localFingerprint,
    idempotencyKey,
    snapshot,
  };
};
