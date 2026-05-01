import type { PersistedState, WorkspaceScope } from '@ddlbuilder/shared-types';
import type {
  ApiErrorPayload,
  WorkspaceChangesPushRequest,
  WorkspaceChangesPushResponse,
  WorkspaceChangesResponse,
  WorkspaceEntityEnvelope,
  WorkspaceListResponse,
} from '@ddlbuilder/shared-types/api';
import type { SavedTableDraftRecord } from '@ddlbuilder/shared-types/workspace';
import {
  addSavedTable,
  deleteSavedTable,
  getSavedTable,
  listSavedTables,
  listTrashedSavedTables,
  updateSavedTable,
  type SavedTableRecord,
  type TableFolder,
} from '@/utils/savedTablesDb';
import { bulkPutFolders, clearFolders, deleteFolder, listFolders } from '@/utils/tableFolders';
import {
  DEFAULT_DRAFT_ID,
  clearWorkspaceSession,
  deleteDraft,
  deleteSavedDraft,
  listDrafts,
  listSavedDrafts,
  listTrashedDrafts,
  readWorkspaceSession,
  writeDraft,
  writeWorkspaceSession,
  upsertSavedDraft,
} from '@/utils/workspaceStateDb';
import {
  clearWorkspaceSyncState,
  enqueueWorkspaceOutboxItem,
  incrementWorkspaceOutboxAttempts,
  listWorkspaceOutboxItems,
  readWorkspaceSyncMeta,
  rebaseWorkspaceOutboxItems,
  removeWorkspaceConflicts,
  removeWorkspaceOutboxItems,
  writeWorkspaceEntityMeta,
  writeWorkspaceConflicts,
  writeWorkspaceSyncMeta,
} from '@/utils/workspaceSyncStateDb';
import { WORKSPACE_SNAPSHOT_APPLIED_EVENT } from './workspaceSyncService';

export type WorkspaceSyncStatus = 'idle' | 'pulling' | 'pushing' | 'synced' | 'conflict' | 'error';

const GLOBAL_DRAFT_ENTITY_ID = '__global_draft__';

const readJsonSafely = async <T>(response: Response): Promise<T | null> => {
  return (await response.json().catch(() => null)) as T | null;
};

const toErrorMessage = (payload: ApiErrorPayload | null, fallback: string) =>
  payload && typeof payload.error === 'string' ? payload.error : fallback;

const normalizeDraftEntityId = (entityId: string) =>
  entityId === GLOBAL_DRAFT_ENTITY_ID ? DEFAULT_DRAFT_ID : entityId;

const buildWorkspaceEntityKey = (
  entityType: WorkspaceEntityEnvelope['entityType'],
  entityId: string,
) =>
  `${entityType}:${entityType === 'draft' ? normalizeDraftEntityId(entityId) : entityId}`;

const buildWorkspaceEntityVersionKey = (
  entityType: WorkspaceEntityEnvelope['entityType'],
  entityId: string,
  version: number,
) => `${buildWorkspaceEntityKey(entityType, entityId)}:${version}`;

const listPendingEntityKeys = async (workspaceId: string) => {
  const outbox = await listWorkspaceOutboxItems(workspaceId);
  return new Set(outbox.map((item) => buildWorkspaceEntityKey(item.entityType, item.entityId)));
};

const dispatchWorkspaceSnapshotApplied = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(WORKSPACE_SNAPSHOT_APPLIED_EVENT));
  }
};

const stableStringify = (value: unknown): string => {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
};

export const buildWorkspaceContentHash = async (payload: unknown) => {
  const bytes = new TextEncoder().encode(stableStringify(payload));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return `sha256:${Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')}`;
};

export const fetchWorkspaceList = async (): Promise<WorkspaceListResponse> => {
  const response = await fetch('/api/workspaces', {
    credentials: 'include',
  });
  const payload = await readJsonSafely<WorkspaceListResponse | ApiErrorPayload>(response);
  if (!response.ok) {
    throw new Error(toErrorMessage(payload as ApiErrorPayload | null, '工作区列表拉取失败'));
  }
  if (!payload || !('activeWorkspaceId' in payload)) {
    throw new Error('工作区列表响应为空');
  }
  return payload as WorkspaceListResponse;
};

export const resolveDefaultWorkspaceScope = async (userId: string): Promise<WorkspaceScope> => {
  const result = await fetchWorkspaceList();
  return {
    kind: 'user',
    userId,
    workspaceId: result.activeWorkspaceId,
  };
};

const pullWorkspaceChanges = async (
  workspaceId: string,
  cursor: number,
): Promise<WorkspaceChangesResponse> => {
  const response = await fetch(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/changes?since=${cursor}`,
    {
      credentials: 'include',
    },
  );
  const payload = await readJsonSafely<WorkspaceChangesResponse | ApiErrorPayload>(response);
  if (!response.ok) {
    throw new Error(toErrorMessage(payload as ApiErrorPayload | null, '工作区增量拉取失败'));
  }
  return payload as WorkspaceChangesResponse;
};

const pushWorkspaceChanges = async (
  workspaceId: string,
  request: WorkspaceChangesPushRequest,
): Promise<WorkspaceChangesPushResponse> => {
  const response = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/changes`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(request),
  });
  const payload = await readJsonSafely<WorkspaceChangesPushResponse | ApiErrorPayload>(response);
  if (!response.ok) {
    throw new Error(toErrorMessage(payload as ApiErrorPayload | null, '工作区增量推送失败'));
  }
  return payload as WorkspaceChangesPushResponse;
};

const upsertSavedTableEntity = async (
  entityId: string,
  payload: Record<string, unknown>,
  updatedAt: number,
  scope: WorkspaceScope,
) => {
  if (!payload.state || typeof payload.name !== 'string') return;

  const existing = await getSavedTable(entityId, scope);
  const record: SavedTableRecord = {
    normalizedName: entityId,
    name: payload.name,
    state: payload.state as PersistedState,
    createdAt: typeof payload.createdAt === 'number' ? payload.createdAt : updatedAt,
    updatedAt,
    ...(typeof payload.folderId === 'string' ? { folderId: payload.folderId } : {}),
  };

  if (existing) {
    await updateSavedTable(
      {
        ...existing,
        ...record,
        createdAt: existing.createdAt ?? record.createdAt,
      },
      scope,
    );
    return;
  }

  await addSavedTable(record, scope);
};

const applyWorkspaceEntity = async (
  entity: WorkspaceEntityEnvelope<unknown>,
  scope: WorkspaceScope,
) => {
  const entityId =
    entity.entityType === 'draft' ? normalizeDraftEntityId(entity.entityId) : entity.entityId;

  if (entity.deletedAt != null) {
    if (entity.entityType === 'draft') {
      await deleteDraft(entityId, scope);
    } else if (entity.entityType === 'saved_table') {
      await deleteSavedTable(entityId, scope);
    } else if (entity.entityType === 'saved_draft') {
      await deleteSavedDraft(entityId, scope);
    } else {
      await deleteFolder(entityId, scope);
    }
    await writeWorkspaceEntityMeta({
      workspaceId: entity.workspaceId,
      entityType: entity.entityType,
      entityId,
      version: entity.version,
      contentHash: entity.contentHash,
    });
    return;
  }

  if (!entity.payload || typeof entity.payload !== 'object' || Array.isArray(entity.payload)) {
    return;
  }

  const payload = entity.payload as Record<string, unknown>;
  if (entity.entityType === 'draft' && payload.state) {
    await writeDraft(
      entityId,
      {
        state: payload.state as PersistedState,
        createdAt: typeof payload.createdAt === 'number' ? payload.createdAt : entity.updatedAt,
        updatedAt: entity.updatedAt,
        ...(typeof payload.folderId === 'string' ? { folderId: payload.folderId } : {}),
      },
      scope,
    );
  } else if (entity.entityType === 'saved_table') {
    await upsertSavedTableEntity(entityId, payload, entity.updatedAt, scope);
  } else if (entity.entityType === 'saved_draft') {
    if (
      payload.state &&
      typeof payload.tableName === 'string' &&
      typeof payload.baseSignature === 'string'
    ) {
      const record: SavedTableDraftRecord = {
        state: payload.state as PersistedState,
        tableName: payload.tableName,
        baseSignature: payload.baseSignature,
        updatedAt: entity.updatedAt,
      };
      await upsertSavedDraft(entityId, record, scope);
    }
  } else if (typeof payload.id === 'string' && typeof payload.name === 'string') {
    await bulkPutFolders(
      [
        {
          id: payload.id,
          name: payload.name,
          order: typeof payload.order === 'number' ? payload.order : 0,
          createdAt: typeof payload.createdAt === 'number' ? payload.createdAt : entity.updatedAt,
          ...(typeof payload.parentId === 'string' ? { parentId: payload.parentId } : {}),
        } satisfies TableFolder,
      ],
      scope,
    );
  }

  await writeWorkspaceEntityMeta({
    workspaceId: entity.workspaceId,
    entityType: entity.entityType,
    entityId,
    version: entity.version,
    contentHash: entity.contentHash,
  });
};

const applyPulledChanges = async (
  response: WorkspaceChangesResponse,
  scope: WorkspaceScope,
  pendingEntityKeys: Set<string>,
  skippedEntityVersionKeys = new Set<string>(),
) => {
  let appliedCount = 0;
  for (const entity of response.entities) {
    const entityKey = buildWorkspaceEntityKey(entity.entityType, entity.entityId);
    const entityVersionKey = buildWorkspaceEntityVersionKey(
      entity.entityType,
      entity.entityId,
      entity.version,
    );
    if (pendingEntityKeys.has(entityKey) || skippedEntityVersionKeys.has(entityVersionKey)) {
      continue;
    }
    await applyWorkspaceEntity(entity, scope);
    appliedCount++;
  }
  return appliedCount;
};

const hasWorkspaceContent = async (scope: WorkspaceScope) => {
  const [drafts, savedTables, savedDrafts, folders] = await Promise.all([
    listDrafts(scope),
    listSavedTables(scope),
    listSavedDrafts(scope),
    listFolders(scope),
  ]);

  return (
    drafts.length > 0 ||
    savedTables.length > 0 ||
    Object.keys(savedDrafts).length > 0 ||
    folders.length > 0
  );
};

export const promoteLegacyUserWorkspaceData = async (scope: WorkspaceScope): Promise<boolean> => {
  if (scope.kind !== 'user' || !scope.workspaceId) {
    return false;
  }

  const legacyScope: WorkspaceScope = {
    kind: 'user',
    userId: scope.userId,
  };
  const [targetHasContent, legacyHasContent] = await Promise.all([
    hasWorkspaceContent(scope),
    hasWorkspaceContent(legacyScope),
  ]);

  if (targetHasContent || !legacyHasContent) {
    return false;
  }

  const [drafts, savedTables, savedDrafts, folders, session] = await Promise.all([
    listDrafts(legacyScope),
    listSavedTables(legacyScope),
    listSavedDrafts(legacyScope),
    listFolders(legacyScope),
    readWorkspaceSession(legacyScope),
  ]);

  for (const { draftId, record } of drafts) {
    await writeDraft(draftId, record, scope);
    const payload = {
      state: record.state,
      createdAt: record.createdAt,
      folderId: record.folderId,
    };
    await enqueueWorkspaceOutboxItem({
      workspaceId: scope.workspaceId,
      entityType: 'draft',
      entityId: draftId,
      op: 'upsert',
      payload,
      contentHash: await buildWorkspaceContentHash(payload),
    });
  }

  for (const table of savedTables) {
    const existing = await getSavedTable(table.normalizedName, scope);
    if (existing) {
      await updateSavedTable(table, scope);
    } else {
      await addSavedTable(table, scope);
    }
    const payload = {
      name: table.name,
      state: table.state,
      createdAt: table.createdAt,
      folderId: table.folderId,
    };
    await enqueueWorkspaceOutboxItem({
      workspaceId: scope.workspaceId,
      entityType: 'saved_table',
      entityId: table.normalizedName,
      op: 'upsert',
      payload,
      contentHash: await buildWorkspaceContentHash(payload),
    });
  }

  for (const [normalizedName, draft] of Object.entries(savedDrafts)) {
    await upsertSavedDraft(normalizedName, draft, scope);
    const payload = {
      tableName: draft.tableName,
      state: draft.state,
      baseSignature: draft.baseSignature,
    };
    await enqueueWorkspaceOutboxItem({
      workspaceId: scope.workspaceId,
      entityType: 'saved_draft',
      entityId: normalizedName,
      op: 'upsert',
      payload,
      contentHash: await buildWorkspaceContentHash(payload),
    });
  }

  if (folders.length > 0) {
    await bulkPutFolders(folders, scope);
  }
  for (const folder of folders) {
    await enqueueWorkspaceOutboxItem({
      workspaceId: scope.workspaceId,
      entityType: 'folder',
      entityId: folder.id,
      op: 'upsert',
      payload: folder,
      contentHash: await buildWorkspaceContentHash(folder),
    });
  }

  if (session) {
    await writeWorkspaceSession(session, scope);
  }

  dispatchWorkspaceSnapshotApplied();
  return true;
};

export const clearLocalWorkspaceData = async (scope: WorkspaceScope): Promise<void> => {
  if (scope.kind !== 'user' || !scope.workspaceId) {
    return;
  }

  const [drafts, trashedDrafts, savedTables, trashedSavedTables, savedDrafts] = await Promise.all([
    listDrafts(scope),
    listTrashedDrafts(scope),
    listSavedTables(scope),
    listTrashedSavedTables(scope),
    listSavedDrafts(scope),
  ]);

  await Promise.all([
    clearWorkspaceSession(scope),
    clearFolders(scope),
    clearWorkspaceSyncState(scope.workspaceId),
    ...drafts.map((item) => deleteDraft(item.draftId, scope)),
    ...trashedDrafts.map((item) => deleteDraft(item.draftId, scope)),
    ...savedTables.map((item) => deleteSavedTable(item.normalizedName, scope)),
    ...trashedSavedTables.map((item) => deleteSavedTable(item.normalizedName, scope)),
    ...Object.keys(savedDrafts).map((normalizedName) => deleteSavedDraft(normalizedName, scope)),
  ]);

  dispatchWorkspaceSnapshotApplied();
};

export const syncWorkspaceOnce = async (
  scope: WorkspaceScope,
): Promise<{
  status: WorkspaceSyncStatus;
  cursor: number;
  conflictCount: number;
}> => {
  if (scope.kind !== 'user' || !scope.workspaceId) {
    throw new Error('增量同步需要已登录 workspace scope');
  }

  const existingMeta = await readWorkspaceSyncMeta(scope.workspaceId);
  const pendingEntityKeys = await listPendingEntityKeys(scope.workspaceId);
  const pulled = await pullWorkspaceChanges(scope.workspaceId, existingMeta?.cursor ?? 0);
  const appliedCount = await applyPulledChanges(pulled, scope, pendingEntityKeys);
  await writeWorkspaceSyncMeta({
    id: scope.workspaceId,
    userId: scope.userId,
    cursor: pulled.cursor,
    lastPulledAt: Date.now(),
    lastPushedAt: existingMeta?.lastPushedAt,
  });

  const outbox = await listWorkspaceOutboxItems(scope.workspaceId);
  if (outbox.length === 0) {
    if (appliedCount > 0) {
      dispatchWorkspaceSnapshotApplied();
    }
    return { status: 'synced', cursor: pulled.cursor, conflictCount: 0 };
  }

  const pushed = await pushWorkspaceChanges(scope.workspaceId, {
    changes: outbox.map((item) => ({
      clientMutationId: item.id,
      entityType: item.entityType,
      entityId: item.entityId,
      op: item.op,
      baseVersion: item.baseVersion,
      contentHash: item.contentHash,
      payload: item.payload,
    })),
  });

  const acceptedIds = new Set(pushed.accepted.map((item) => item.clientMutationId));
  const acceptedItems = outbox.filter((item) => acceptedIds.has(item.id));
  for (const item of acceptedItems) {
    const accepted = pushed.accepted.find(
      (acceptedItem) => acceptedItem.clientMutationId === item.id,
    );
    if (!accepted) continue;
    await writeWorkspaceEntityMeta({
      workspaceId: scope.workspaceId,
      entityType: item.entityType,
      entityId: item.entityId,
      version: accepted.version,
      contentHash: item.contentHash,
    });
  }
  await removeWorkspaceOutboxItems([...acceptedIds]);
  await removeWorkspaceConflicts(
    [...acceptedIds].map((clientMutationId) => `${scope.workspaceId}:${clientMutationId}`),
  );
  for (const accepted of pushed.accepted) {
    await rebaseWorkspaceOutboxItems({
      workspaceId: scope.workspaceId,
      entityType: accepted.entityType,
      entityId: accepted.entityId,
      baseVersion: accepted.version,
    });
  }

  const rejectedItems = outbox.filter((item) => !acceptedIds.has(item.id));
  if (rejectedItems.length > 0) {
    await incrementWorkspaceOutboxAttempts(rejectedItems);
  }
  if (pushed.conflicts.length > 0) {
    await writeWorkspaceConflicts(scope.workspaceId, pushed.conflicts);
  }

  const nextPulled = await pullWorkspaceChanges(scope.workspaceId, pulled.cursor);
  const acceptedEntityVersionKeys = new Set(
    pushed.accepted.map((item) =>
      buildWorkspaceEntityVersionKey(item.entityType, item.entityId, item.version),
    ),
  );
  const nextAppliedCount = await applyPulledChanges(
    nextPulled,
    scope,
    await listPendingEntityKeys(scope.workspaceId),
    acceptedEntityVersionKeys,
  );
  await writeWorkspaceSyncMeta({
    id: scope.workspaceId,
    userId: scope.userId,
    cursor: nextPulled.cursor,
    lastPulledAt: Date.now(),
    lastPushedAt: Date.now(),
  });
  if (appliedCount + nextAppliedCount > 0) {
    dispatchWorkspaceSnapshotApplied();
  }

  return {
    status: pushed.conflicts.length > 0 ? 'conflict' : 'synced',
    cursor: nextPulled.cursor,
    conflictCount: pushed.conflicts.length,
  };
};
