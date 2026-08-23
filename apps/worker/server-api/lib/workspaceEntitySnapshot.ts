import type { PersistedState } from '@ddlbuilder/shared-types';
import type { WorkspaceEntityType, WorkspaceSnapshot } from '@ddlbuilder/shared-types/workspace';
import { normalizeWorkspaceSnapshot } from '@ddlbuilder/workspace-core';

export const GLOBAL_DRAFT_ENTITY_ID = '__global_draft__';

export type WorkspaceEntityInput = {
  entityType: WorkspaceEntityType;
  entityId: string;
  payload: unknown;
  sourceUpdatedAt: number;
};

export type StoredWorkspaceEntity = {
  entityType: WorkspaceEntityType;
  entityId: string;
  payloadJson: string | null;
  updatedAt: number;
};

export type LegacyWorkspaceSnapshotRow = {
  kind: 'global_draft' | WorkspaceEntityType;
  normalizedName: string | null;
  payloadJson: string;
  sourceUpdatedAt: number;
};

const emptyWorkspaceSnapshot = (): WorkspaceSnapshot => ({
  globalDraft: null,
  drafts: [],
  savedTables: [],
  savedDrafts: [],
  folders: [],
});

export const workspaceSnapshotToEntities = (
  snapshot: WorkspaceSnapshot,
): WorkspaceEntityInput[] => {
  const normalizedSnapshot = normalizeWorkspaceSnapshot(snapshot);
  const entities: WorkspaceEntityInput[] = [];

  for (const item of normalizedSnapshot.drafts) {
    entities.push({
      entityType: 'draft',
      entityId: item.draftId,
      payload: {
        state: item.state,
        createdAt: item.createdAt,
        folderId: item.folderId,
      },
      sourceUpdatedAt: item.updatedAt,
    });
  }

  for (const item of normalizedSnapshot.savedTables) {
    entities.push({
      entityType: 'saved_table',
      entityId: item.normalizedName,
      payload: {
        name: item.name,
        state: item.state,
        createdAt: item.createdAt,
        folderId: item.folderId,
      },
      sourceUpdatedAt: item.updatedAt,
    });
  }

  for (const item of normalizedSnapshot.savedDrafts) {
    entities.push({
      entityType: 'saved_draft',
      entityId: item.normalizedName,
      payload: {
        tableName: item.tableName,
        state: item.state,
        baseSignature: item.baseSignature,
      },
      sourceUpdatedAt: item.updatedAt,
    });
  }

  for (const item of normalizedSnapshot.folders) {
    entities.push({
      entityType: 'folder',
      entityId: item.id,
      payload: {
        id: item.id,
        name: item.name,
        parentId: item.parentId,
        order: item.order,
        createdAt: item.createdAt,
      },
      sourceUpdatedAt: item.createdAt,
    });
  }

  return entities;
};

const applyPayloadToSnapshot = (
  snapshot: WorkspaceSnapshot,
  input: {
    entityType: WorkspaceEntityType;
    entityId: string;
    payload: Record<string, unknown>;
    updatedAt: number;
  },
) => {
  const { entityType, entityId, payload, updatedAt } = input;

  if (entityType === 'draft' && entityId === GLOBAL_DRAFT_ENTITY_ID) {
    if (payload.state) {
      snapshot.globalDraft = {
        state: payload.state as PersistedState,
        updatedAt,
      };
    }
    return;
  }

  if (entityType === 'draft') {
    if (payload.state) {
      snapshot.drafts.push({
        draftId: entityId,
        state: payload.state as WorkspaceSnapshot['drafts'][number]['state'],
        createdAt: typeof payload.createdAt === 'number' ? payload.createdAt : updatedAt,
        updatedAt,
        ...(typeof payload.folderId === 'string' ? { folderId: payload.folderId } : {}),
      });
    }
    return;
  }

  if (entityType === 'saved_table') {
    if (payload.state && typeof payload.name === 'string') {
      snapshot.savedTables.push({
        normalizedName: entityId,
        name: payload.name,
        state: payload.state as WorkspaceSnapshot['savedTables'][number]['state'],
        createdAt: typeof payload.createdAt === 'number' ? payload.createdAt : updatedAt,
        updatedAt,
        ...(typeof payload.folderId === 'string' ? { folderId: payload.folderId } : {}),
      });
    }
    return;
  }

  if (entityType === 'folder') {
    if (typeof payload.id === 'string' && typeof payload.name === 'string') {
      snapshot.folders.push({
        id: payload.id,
        name: payload.name,
        ...(typeof payload.parentId === 'string' ? { parentId: payload.parentId } : {}),
        order: typeof payload.order === 'number' ? payload.order : 0,
        createdAt: typeof payload.createdAt === 'number' ? payload.createdAt : updatedAt,
      });
    }
    return;
  }

  if (
    typeof payload.tableName === 'string' &&
    typeof payload.baseSignature === 'string' &&
    payload.state
  ) {
    snapshot.savedDrafts.push({
      normalizedName: entityId,
      tableName: payload.tableName,
      state: payload.state as WorkspaceSnapshot['savedDrafts'][number]['state'],
      updatedAt,
      baseSignature: payload.baseSignature,
    });
  }
};

export const storedEntitiesToWorkspaceSnapshot = (
  rows: StoredWorkspaceEntity[],
): WorkspaceSnapshot => {
  const snapshot = emptyWorkspaceSnapshot();

  for (const row of rows) {
    if (row.payloadJson == null) continue;
    applyPayloadToSnapshot(snapshot, {
      entityType: row.entityType,
      entityId: row.entityId,
      payload: JSON.parse(row.payloadJson) as Record<string, unknown>,
      updatedAt: row.updatedAt,
    });
  }

  snapshot.drafts.sort((a, b) => (b.createdAt ?? b.updatedAt) - (a.createdAt ?? a.updatedAt));
  snapshot.savedTables.sort((a, b) => (b.createdAt ?? b.updatedAt) - (a.createdAt ?? a.updatedAt));
  snapshot.savedDrafts.sort((a, b) => b.updatedAt - a.updatedAt);
  snapshot.folders.sort((a, b) => a.order - b.order);

  return normalizeWorkspaceSnapshot(snapshot);
};

export const legacyRowsToWorkspaceSnapshot = (
  rows: LegacyWorkspaceSnapshotRow[],
): WorkspaceSnapshot => {
  const snapshot = emptyWorkspaceSnapshot();

  for (const row of rows) {
    const payload = JSON.parse(row.payloadJson) as Record<string, unknown>;
    const entityType = row.kind === 'global_draft' ? 'draft' : row.kind;
    const entityId = row.kind === 'global_draft' ? GLOBAL_DRAFT_ENTITY_ID : row.normalizedName;
    if (!entityId) continue;
    applyPayloadToSnapshot(snapshot, {
      entityType,
      entityId,
      payload,
      updatedAt: row.sourceUpdatedAt,
    });
  }

  return normalizeWorkspaceSnapshot(snapshot);
};
