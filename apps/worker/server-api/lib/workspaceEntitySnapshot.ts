import type { WorkspaceEntityType, WorkspaceSnapshot } from '@ddlbuilder/shared-types/workspace';
import {
  decodeSchemaDocumentState,
  decodeSavedDraftBase,
  normalizeWorkspaceSnapshot,
} from '@ddlbuilder/workspace-core';

export const LEGACY_GLOBAL_DRAFT_ENTITY_ID = '__global_draft__';

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
        trashedAt: item.trashedAt,
      },
      sourceUpdatedAt: item.updatedAt,
    });
  }

  for (const item of normalizedSnapshot.savedTables) {
    entities.push({
      entityType: 'saved_table',
      entityId: item.tableId ?? item.normalizedName,
      payload: {
        tableId: item.tableId,
        normalizedName: item.normalizedName,
        name: item.name,
        state: item.state,
        createdAt: item.createdAt,
        folderId: item.folderId,
        trashedAt: item.trashedAt,
      },
      sourceUpdatedAt: item.updatedAt,
    });
  }

  for (const item of normalizedSnapshot.savedDrafts) {
    entities.push({
      entityType: 'saved_draft',
      entityId: item.tableId ?? item.normalizedName,
      payload: {
        tableId: item.tableId,
        normalizedName: item.normalizedName,
        tableName: item.tableName,
        state: item.state,
        baseSignature: item.baseSignature,
        baseState: item.baseState,
      },
      sourceUpdatedAt: item.updatedAt,
    });
  }

  for (const item of normalizedSnapshot.folders) {
    entities.push({
      entityType: 'folder',
      entityId: item.id,
      payload: {
        name: item.name,
        parentId: item.parentId,
        order: item.order,
        createdAt: item.createdAt,
      },
      sourceUpdatedAt: item.updatedAt,
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
): boolean => {
  const { entityType, entityId, payload, updatedAt } = input;
  const state = decodeSchemaDocumentState(payload.state);

  if (entityType === 'draft' && entityId === LEGACY_GLOBAL_DRAFT_ENTITY_ID) {
    if (state) {
      snapshot.globalDraft = {
        state,
        updatedAt,
      };
      return true;
    }
    return false;
  }

  if (entityType === 'draft') {
    if (state) {
      snapshot.drafts.push({
        draftId: entityId,
        state,
        createdAt: typeof payload.createdAt === 'number' ? payload.createdAt : updatedAt,
        updatedAt,
        ...(typeof payload.folderId === 'string' ? { folderId: payload.folderId } : {}),
        ...(typeof payload.trashedAt === 'number' ? { trashedAt: payload.trashedAt } : {}),
      });
      return true;
    }
    return false;
  }

  if (entityType === 'saved_table') {
    if (state && typeof payload.name === 'string') {
      snapshot.savedTables.push({
        ...(typeof payload.tableId === 'string' ? { tableId: payload.tableId } : {}),
        normalizedName:
          typeof payload.normalizedName === 'string' ? payload.normalizedName : entityId,
        name: payload.name,
        state,
        createdAt: typeof payload.createdAt === 'number' ? payload.createdAt : updatedAt,
        updatedAt,
        ...(typeof payload.folderId === 'string' ? { folderId: payload.folderId } : {}),
        ...(typeof payload.trashedAt === 'number' ? { trashedAt: payload.trashedAt } : {}),
      });
      return true;
    }
    return false;
  }

  if (entityType === 'folder') {
    if (typeof payload.name === 'string') {
      snapshot.folders.push({
        id: entityId,
        name: payload.name,
        ...(typeof payload.parentId === 'string' ? { parentId: payload.parentId } : {}),
        order: typeof payload.order === 'number' ? payload.order : 0,
        createdAt: typeof payload.createdAt === 'number' ? payload.createdAt : updatedAt,
        updatedAt,
      });
      return true;
    }
    return false;
  }

  if (typeof payload.tableName === 'string' && typeof payload.baseSignature === 'string' && state) {
    snapshot.savedDrafts.push({
      ...(typeof payload.tableId === 'string' ? { tableId: payload.tableId } : {}),
      normalizedName:
        typeof payload.normalizedName === 'string' ? payload.normalizedName : entityId,
      tableName: payload.tableName,
      state,
      updatedAt,
      ...decodeSavedDraftBase(payload),
    });
    return true;
  }
  return false;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const reportDecodeFailure = (
  entityType: WorkspaceEntityType,
  entityId: string,
  reason: 'invalid_json' | 'invalid_payload',
) => {
  console.warn('workspace_entity_decode_failed', { entityType, entityId, reason });
};

const decodeEntityPayload = (
  entityType: WorkspaceEntityType,
  entityId: string,
  payloadJson: string,
) => {
  try {
    const payload: unknown = JSON.parse(payloadJson);
    if (isRecord(payload)) return payload;
    reportDecodeFailure(entityType, entityId, 'invalid_payload');
  } catch {
    reportDecodeFailure(entityType, entityId, 'invalid_json');
  }
  return null;
};

export const storedEntitiesToWorkspaceSnapshot = (
  rows: StoredWorkspaceEntity[],
): WorkspaceSnapshot => {
  const snapshot = emptyWorkspaceSnapshot();

  for (const row of rows) {
    if (row.payloadJson == null) continue;
    const payload = decodeEntityPayload(row.entityType, row.entityId, row.payloadJson);
    if (!payload) continue;
    const applied = applyPayloadToSnapshot(snapshot, {
      entityType: row.entityType,
      entityId: row.entityId,
      payload,
      updatedAt: row.updatedAt,
    });
    if (!applied) reportDecodeFailure(row.entityType, row.entityId, 'invalid_payload');
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
    const entityType = row.kind === 'global_draft' ? 'draft' : row.kind;
    const entityId =
      row.kind === 'global_draft' ? LEGACY_GLOBAL_DRAFT_ENTITY_ID : row.normalizedName;
    if (!entityId) continue;
    const payload = decodeEntityPayload(entityType, entityId, row.payloadJson);
    if (!payload) continue;
    const applied = applyPayloadToSnapshot(snapshot, {
      entityType,
      entityId,
      payload,
      updatedAt: row.sourceUpdatedAt,
    });
    if (!applied) reportDecodeFailure(entityType, entityId, 'invalid_payload');
  }

  return normalizeWorkspaceSnapshot(snapshot);
};
