import type { PersistedState } from '@ddlbuilder/shared-types';
import type {
  WorkspaceChangesPushRequest,
  WorkspaceChangesPushResponse,
  WorkspaceChangesResponse,
  WorkspaceEntityEnvelope,
  WorkspaceEntityOperation,
  WorkspaceEntityType,
  WorkspaceListResponse,
  WorkspaceSnapshot,
} from '@ddlbuilder/shared-types/workspace';
import type { ApiEnv } from './context.js';

type WorkspaceRow = {
  id: string;
  name: string;
  isDefault: number;
  activeAt: number | null;
  updatedAt: number;
};

type EntityRow = {
  entityType: WorkspaceEntityType;
  entityId: string;
  payloadJson: string | null;
  contentHash: string | null;
  version: number;
  deletedAt: number | null;
  updatedAt: number;
};

type MutationRow = {
  entityType: WorkspaceEntityType;
  entityId: string;
  version: number;
};

type EntityInput = {
  entityType: WorkspaceEntityType;
  entityId: string;
  payload: unknown;
  sourceUpdatedAt: number;
};

type LegacySnapshotKind = 'global_draft' | WorkspaceEntityType;

type LegacySnapshotRow = {
  kind: LegacySnapshotKind;
  normalizedName: string | null;
  payloadJson: string;
  sourceUpdatedAt: number;
};

const DEFAULT_WORKSPACE_NAME = 'Default Workspace';
const GLOBAL_DRAFT_ENTITY_ID = '__global_draft__';

const ENTITY_TYPES = new Set<WorkspaceEntityType>([
  'draft',
  'saved_table',
  'saved_draft',
  'folder',
]);

export class WorkspaceNotFoundError extends Error {
  constructor() {
    super('WORKSPACE_NOT_FOUND');
  }
}

export const isWorkspaceEntityType = (value: unknown): value is WorkspaceEntityType =>
  typeof value === 'string' && ENTITY_TYPES.has(value as WorkspaceEntityType);

export const isWorkspaceEntityOperation = (value: unknown): value is WorkspaceEntityOperation =>
  value === 'upsert' || value === 'delete';

const now = () => Date.now();

const buildWorkspaceId = () => `ws_${crypto.randomUUID()}`;

const buildEntityRowId = (workspaceId: string, entityType: WorkspaceEntityType, entityId: string) =>
  `${workspaceId}:${entityType}:${entityId}`;

const buildMutationRowId = (workspaceId: string, clientMutationId: string) =>
  `${workspaceId}:${clientMutationId}`;

const normalizeWorkspace = (row: WorkspaceRow) => ({
  id: row.id,
  name: row.name,
  isDefault: row.isDefault === 1,
  ...(row.activeAt == null ? {} : { activeAt: row.activeAt }),
  updatedAt: row.updatedAt,
});

const stableStringify = (value: unknown): string => {
  if (value === undefined) {
    return 'undefined';
  }

  if (value === null) {
    return 'null';
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }

  if (typeof value === 'bigint') {
    return `bigint:${value.toString()}`;
  }

  if (typeof value === 'symbol') {
    return `symbol:${value.description ?? ''}`;
  }

  if (typeof value === 'function') {
    return 'function';
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

const parseEntityPayload = (row: EntityRow) =>
  row.payloadJson == null ? null : (JSON.parse(row.payloadJson) as unknown);

const toEnvelope = (workspaceId: string, row: EntityRow): WorkspaceEntityEnvelope<unknown> => ({
  workspaceId,
  entityType: row.entityType,
  entityId: row.entityId,
  version: row.version,
  contentHash: row.contentHash,
  payload: parseEntityPayload(row),
  ...(row.deletedAt == null ? {} : { deletedAt: row.deletedAt }),
  updatedAt: row.updatedAt,
});

const readDefaultWorkspace = async (env: ApiEnv['Bindings'], userId: string) =>
  env.USER_DB.prepare(
    `
      SELECT
        id,
        name,
        is_default AS isDefault,
        active_at AS activeAt,
        updated_at AS updatedAt
      FROM workspaces
      WHERE user_id = ? AND is_default = 1
      LIMIT 1
    `,
  )
    .bind(userId)
    .first<WorkspaceRow>();

export const getOrCreateDefaultWorkspace = async (
  env: ApiEnv['Bindings'],
  userId: string,
): Promise<WorkspaceRow> => {
  const existing = await readDefaultWorkspace(env, userId);
  if (existing) {
    return existing;
  }

  const timestamp = now();
  const workspaceId = buildWorkspaceId();
  const workspaceResult = await env.USER_DB.prepare(
    `
      INSERT INTO workspaces (
        id,
        user_id,
        name,
        is_default,
        active_at,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, 1, ?, ?, ?)
    `,
  )
    .bind(workspaceId, userId, DEFAULT_WORKSPACE_NAME, timestamp, timestamp, timestamp)
    .run();

  if (!workspaceResult.success) {
    throw new Error(workspaceResult.error ?? 'D1 execution failed');
  }

  const clockResult = await env.USER_DB.prepare(
    `
      INSERT INTO workspace_clocks (workspace_id, next_version)
      VALUES (?, 0)
    `,
  )
    .bind(workspaceId)
    .run();

  if (!clockResult.success) {
    throw new Error(clockResult.error ?? 'D1 execution failed');
  }

  const created = await readDefaultWorkspace(env, userId);
  if (!created) {
    throw new Error('Default workspace creation failed');
  }

  return created;
};

export const listWorkspaces = async (
  env: ApiEnv['Bindings'],
  userId: string,
): Promise<WorkspaceListResponse> => {
  const activeWorkspace = await getOrCreateDefaultWorkspace(env, userId);
  const result = await env.USER_DB.prepare(
    `
      SELECT
        id,
        name,
        is_default AS isDefault,
        active_at AS activeAt,
        updated_at AS updatedAt
      FROM workspaces
      WHERE user_id = ?
      ORDER BY is_default DESC, updated_at DESC
    `,
  )
    .bind(userId)
    .all<WorkspaceRow>();

  return {
    workspaces: (result.results ?? []).map(normalizeWorkspace),
    activeWorkspaceId: activeWorkspace.id,
  };
};

const assertWorkspaceOwner = async (
  env: ApiEnv['Bindings'],
  userId: string,
  workspaceId: string,
) => {
  const row = await env.USER_DB.prepare(
    `
      SELECT id
      FROM workspaces
      WHERE id = ? AND user_id = ?
      LIMIT 1
    `,
  )
    .bind(workspaceId, userId)
    .first<{ id: string }>();

  if (!row) {
    throw new WorkspaceNotFoundError();
  }
};

const readWorkspaceCursor = async (env: ApiEnv['Bindings'], workspaceId: string) => {
  const row = await env.USER_DB.prepare(
    `
      SELECT next_version AS cursor
      FROM workspace_clocks
      WHERE workspace_id = ?
      LIMIT 1
    `,
  )
    .bind(workspaceId)
    .first<{ cursor: number }>();

  return row?.cursor ?? 0;
};

const allocateWorkspaceVersion = async (env: ApiEnv['Bindings'], workspaceId: string) => {
  const row = await env.USER_DB.prepare(
    `
      UPDATE workspace_clocks
      SET next_version = next_version + 1
      WHERE workspace_id = ?
      RETURNING next_version AS version
    `,
  )
    .bind(workspaceId)
    .first<{ version: number }>();

  if (!row) {
    throw new Error('Workspace clock missing');
  }

  return row.version;
};

const readEntity = async (
  env: ApiEnv['Bindings'],
  workspaceId: string,
  entityType: WorkspaceEntityType,
  entityId: string,
) =>
  env.USER_DB.prepare(
    `
      SELECT
        entity_type AS entityType,
        entity_id AS entityId,
        payload_json AS payloadJson,
        content_hash AS contentHash,
        version,
        deleted_at AS deletedAt,
        updated_at AS updatedAt
      FROM workspace_entities
      WHERE workspace_id = ? AND entity_type = ? AND entity_id = ?
      LIMIT 1
    `,
  )
    .bind(workspaceId, entityType, entityId)
    .first<EntityRow>();

const writeEntityVersion = async (
  env: ApiEnv['Bindings'],
  input: {
    userId: string;
    workspaceId: string;
    entityType: WorkspaceEntityType;
    entityId: string;
    op: WorkspaceEntityOperation;
    payload: unknown;
    contentHash: string | null;
    updatedAt: number;
  },
) => {
  const version = await allocateWorkspaceVersion(env, input.workspaceId);
  const deletedAt = input.op === 'delete' ? input.updatedAt : null;
  const payloadJson = input.op === 'delete' ? null : JSON.stringify(input.payload);
  const contentHash = input.op === 'delete' ? null : input.contentHash;
  const result = await env.USER_DB.prepare(
    `
      INSERT INTO workspace_entities (
        id,
        workspace_id,
        user_id,
        entity_type,
        entity_id,
        payload_json,
        content_hash,
        version,
        deleted_at,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(workspace_id, entity_type, entity_id) DO UPDATE SET
        payload_json = excluded.payload_json,
        content_hash = excluded.content_hash,
        version = excluded.version,
        deleted_at = excluded.deleted_at,
        updated_at = excluded.updated_at
    `,
  )
    .bind(
      buildEntityRowId(input.workspaceId, input.entityType, input.entityId),
      input.workspaceId,
      input.userId,
      input.entityType,
      input.entityId,
      payloadJson,
      contentHash,
      version,
      deletedAt,
      input.updatedAt,
      input.updatedAt,
    )
    .run();

  if (!result.success) {
    throw new Error(result.error ?? 'D1 execution failed');
  }

  return version;
};

const writeMutation = async (
  env: ApiEnv['Bindings'],
  input: {
    userId: string;
    workspaceId: string;
    clientMutationId: string;
    entityType: WorkspaceEntityType;
    entityId: string;
    version: number;
  },
) => {
  const result = await env.USER_DB.prepare(
    `
      INSERT INTO workspace_mutations (
        id,
        workspace_id,
        user_id,
        client_mutation_id,
        entity_type,
        entity_id,
        version,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(workspace_id, client_mutation_id) DO NOTHING
    `,
  )
    .bind(
      buildMutationRowId(input.workspaceId, input.clientMutationId),
      input.workspaceId,
      input.userId,
      input.clientMutationId,
      input.entityType,
      input.entityId,
      input.version,
      now(),
    )
    .run();

  if (!result.success) {
    throw new Error(result.error ?? 'D1 execution failed');
  }
};

const readMutation = async (
  env: ApiEnv['Bindings'],
  workspaceId: string,
  clientMutationId: string,
) =>
  env.USER_DB.prepare(
    `
      SELECT
        entity_type AS entityType,
        entity_id AS entityId,
        version
      FROM workspace_mutations
      WHERE workspace_id = ? AND client_mutation_id = ?
      LIMIT 1
    `,
  )
    .bind(workspaceId, clientMutationId)
    .first<MutationRow>();

const listActiveEntities = async (env: ApiEnv['Bindings'], workspaceId: string) => {
  const result = await env.USER_DB.prepare(
    `
      SELECT
        entity_type AS entityType,
        entity_id AS entityId,
        payload_json AS payloadJson,
        content_hash AS contentHash,
        version,
        deleted_at AS deletedAt,
        updated_at AS updatedAt
      FROM workspace_entities
      WHERE workspace_id = ? AND deleted_at IS NULL
      ORDER BY version ASC
    `,
  )
    .bind(workspaceId)
    .all<EntityRow>();

  return result.results ?? [];
};

export const getWorkspaceChanges = async (
  env: ApiEnv['Bindings'],
  userId: string,
  workspaceId: string,
  since: number,
): Promise<WorkspaceChangesResponse> => {
  await assertWorkspaceOwner(env, userId, workspaceId);
  const result = await env.USER_DB.prepare(
    `
      SELECT
        entity_type AS entityType,
        entity_id AS entityId,
        payload_json AS payloadJson,
        content_hash AS contentHash,
        version,
        deleted_at AS deletedAt,
        updated_at AS updatedAt
      FROM workspace_entities
      WHERE workspace_id = ? AND version > ?
      ORDER BY version ASC
    `,
  )
    .bind(workspaceId, since)
    .all<EntityRow>();

  return {
    workspaceId,
    cursor: await readWorkspaceCursor(env, workspaceId),
    entities: (result.results ?? []).map((row) => toEnvelope(workspaceId, row)),
  };
};

export const pushWorkspaceChanges = async (
  env: ApiEnv['Bindings'],
  userId: string,
  workspaceId: string,
  request: WorkspaceChangesPushRequest,
): Promise<WorkspaceChangesPushResponse> => {
  await assertWorkspaceOwner(env, userId, workspaceId);
  const accepted: WorkspaceChangesPushResponse['accepted'] = [];
  const conflicts: WorkspaceChangesPushResponse['conflicts'] = [];

  for (const change of request.changes) {
    const mutation = await readMutation(env, workspaceId, change.clientMutationId);
    if (mutation) {
      accepted.push({
        clientMutationId: change.clientMutationId,
        entityType: mutation.entityType,
        entityId: mutation.entityId,
        version: mutation.version,
      });
      continue;
    }

    const existing = await readEntity(env, workspaceId, change.entityType, change.entityId);
    const sameContent =
      existing &&
      ((change.op === 'delete' && existing.deletedAt != null) ||
        (change.op === 'upsert' &&
          existing.deletedAt == null &&
          existing.contentHash === change.contentHash));

    if (sameContent) {
      await writeMutation(env, {
        userId,
        workspaceId,
        clientMutationId: change.clientMutationId,
        entityType: change.entityType,
        entityId: change.entityId,
        version: existing.version,
      });
      accepted.push({
        clientMutationId: change.clientMutationId,
        entityType: change.entityType,
        entityId: change.entityId,
        version: existing.version,
      });
      continue;
    }

    if (
      existing &&
      change.baseVersion !== existing.version &&
      existing.contentHash !== change.contentHash
    ) {
      conflicts.push({
        clientMutationId: change.clientMutationId,
        entityType: change.entityType,
        entityId: change.entityId,
        serverVersion: existing.version,
        serverContentHash: existing.contentHash,
        serverPayload: parseEntityPayload(existing),
      });
      continue;
    }

    const version = await writeEntityVersion(env, {
      userId,
      workspaceId,
      entityType: change.entityType,
      entityId: change.entityId,
      op: change.op,
      payload: change.payload,
      contentHash: change.contentHash,
      updatedAt: now(),
    });
    await writeMutation(env, {
      userId,
      workspaceId,
      clientMutationId: change.clientMutationId,
      entityType: change.entityType,
      entityId: change.entityId,
      version,
    });
    accepted.push({
      clientMutationId: change.clientMutationId,
      entityType: change.entityType,
      entityId: change.entityId,
      version,
    });
  }

  return {
    cursor: await readWorkspaceCursor(env, workspaceId),
    accepted,
    conflicts,
  };
};

const snapshotToEntities = (snapshot: WorkspaceSnapshot): EntityInput[] => {
  const entities: EntityInput[] = [];

  if (snapshot.globalDraft) {
    entities.push({
      entityType: 'draft',
      entityId: GLOBAL_DRAFT_ENTITY_ID,
      payload: { state: snapshot.globalDraft.state },
      sourceUpdatedAt: snapshot.globalDraft.updatedAt,
    });
  }

  for (const item of snapshot.drafts) {
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

  for (const item of snapshot.savedTables) {
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

  for (const item of snapshot.savedDrafts) {
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

  for (const item of snapshot.folders) {
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

const listLegacySnapshotRows = async (env: ApiEnv['Bindings'], userId: string) => {
  const result = await env.USER_DB.prepare(
    `
      SELECT
        kind,
        normalized_name AS normalizedName,
        payload_json AS payloadJson,
        source_updated_at AS sourceUpdatedAt
      FROM workspace_snapshots
      WHERE user_id = ?
    `,
  )
    .bind(userId)
    .all<LegacySnapshotRow>();

  return result.results ?? [];
};

const legacyRowsToSnapshot = (rows: LegacySnapshotRow[]): WorkspaceSnapshot => {
  const snapshot: WorkspaceSnapshot = {
    globalDraft: null,
    drafts: [],
    savedTables: [],
    savedDrafts: [],
    folders: [],
  };

  for (const row of rows) {
    const payload = JSON.parse(row.payloadJson) as Record<string, unknown>;

    if (row.kind === 'global_draft') {
      if (payload.state) {
        snapshot.globalDraft = {
          state: payload.state as PersistedState,
          updatedAt: row.sourceUpdatedAt,
        };
      }
      continue;
    }

    if (!row.normalizedName) {
      continue;
    }

    if (row.kind === 'draft') {
      if (payload.state) {
        snapshot.drafts.push({
          draftId: row.normalizedName,
          state: payload.state as WorkspaceSnapshot['drafts'][number]['state'],
          createdAt:
            typeof payload.createdAt === 'number' ? payload.createdAt : row.sourceUpdatedAt,
          updatedAt: row.sourceUpdatedAt,
          ...(typeof payload.folderId === 'string' ? { folderId: payload.folderId } : {}),
        });
      }
      continue;
    }

    if (row.kind === 'saved_table') {
      if (payload.state && typeof payload.name === 'string') {
        snapshot.savedTables.push({
          normalizedName: row.normalizedName,
          name: payload.name,
          state: payload.state as WorkspaceSnapshot['savedTables'][number]['state'],
          createdAt:
            typeof payload.createdAt === 'number' ? payload.createdAt : row.sourceUpdatedAt,
          updatedAt: row.sourceUpdatedAt,
          ...(typeof payload.folderId === 'string' ? { folderId: payload.folderId } : {}),
        });
      }
      continue;
    }

    if (row.kind === 'folder') {
      if (typeof payload.id === 'string' && typeof payload.name === 'string') {
        snapshot.folders.push({
          id: payload.id,
          name: payload.name,
          ...(typeof payload.parentId === 'string' ? { parentId: payload.parentId } : {}),
          order: typeof payload.order === 'number' ? payload.order : 0,
          createdAt:
            typeof payload.createdAt === 'number' ? payload.createdAt : row.sourceUpdatedAt,
        });
      }
      continue;
    }

    if (
      typeof payload.tableName === 'string' &&
      typeof payload.baseSignature === 'string' &&
      payload.state
    ) {
      snapshot.savedDrafts.push({
        normalizedName: row.normalizedName,
        tableName: payload.tableName,
        state: payload.state as WorkspaceSnapshot['savedDrafts'][number]['state'],
        updatedAt: row.sourceUpdatedAt,
        baseSignature: payload.baseSignature,
      });
    }
  }

  return snapshot;
};

export const upsertWorkspaceSnapshotEntity = async (
  env: ApiEnv['Bindings'],
  input: {
    userId: string;
    kind: 'global_draft' | WorkspaceEntityType;
    normalizedName: string | null;
    payload: Record<string, unknown>;
    sourceUpdatedAt: number;
  },
) => {
  const workspace = await getOrCreateDefaultWorkspace(env, input.userId);
  const entityType = input.kind === 'global_draft' ? 'draft' : input.kind;
  const entityId = input.kind === 'global_draft' ? GLOBAL_DRAFT_ENTITY_ID : input.normalizedName;
  if (!entityId) {
    return;
  }

  await writeEntityVersion(env, {
    userId: input.userId,
    workspaceId: workspace.id,
    entityType,
    entityId,
    op: 'upsert',
    payload: input.payload,
    contentHash: await buildWorkspaceContentHash(input.payload),
    updatedAt: input.sourceUpdatedAt,
  });
};

export const getWorkspaceSnapshotFromEntities = async (
  env: ApiEnv['Bindings'],
  userId: string,
): Promise<WorkspaceSnapshot> => {
  const workspace = await getOrCreateDefaultWorkspace(env, userId);
  const rows = await listActiveEntities(env, workspace.id);
  if (rows.length === 0) {
    const legacyRows = await listLegacySnapshotRows(env, userId);
    if (legacyRows.length > 0) {
      const legacySnapshot = legacyRowsToSnapshot(legacyRows);
      await putWorkspaceSnapshotAsEntities(env, userId, legacySnapshot);
      return legacySnapshot;
    }
  }

  const snapshot: WorkspaceSnapshot = {
    globalDraft: null,
    drafts: [],
    savedTables: [],
    savedDrafts: [],
    folders: [],
  };

  for (const row of rows) {
    const payload = parseEntityPayload(row) as Record<string, unknown> | null;
    if (!payload) continue;

    if (row.entityType === 'draft' && row.entityId === GLOBAL_DRAFT_ENTITY_ID) {
      if (payload.state) {
        snapshot.globalDraft = {
          state: payload.state as PersistedState,
          updatedAt: row.updatedAt,
        };
      }
      continue;
    }

    if (row.entityType === 'draft') {
      if (payload.state) {
        snapshot.drafts.push({
          draftId: row.entityId,
          state: payload.state as WorkspaceSnapshot['drafts'][number]['state'],
          createdAt: typeof payload.createdAt === 'number' ? payload.createdAt : row.updatedAt,
          updatedAt: row.updatedAt,
          ...(typeof payload.folderId === 'string' ? { folderId: payload.folderId } : {}),
        });
      }
      continue;
    }

    if (row.entityType === 'saved_table') {
      if (payload.state && typeof payload.name === 'string') {
        snapshot.savedTables.push({
          normalizedName: row.entityId,
          name: payload.name,
          state: payload.state as WorkspaceSnapshot['savedTables'][number]['state'],
          createdAt: typeof payload.createdAt === 'number' ? payload.createdAt : row.updatedAt,
          updatedAt: row.updatedAt,
          ...(typeof payload.folderId === 'string' ? { folderId: payload.folderId } : {}),
        });
      }
      continue;
    }

    if (row.entityType === 'folder') {
      if (typeof payload.id === 'string' && typeof payload.name === 'string') {
        snapshot.folders.push({
          id: payload.id,
          name: payload.name,
          ...(typeof payload.parentId === 'string' ? { parentId: payload.parentId } : {}),
          order: typeof payload.order === 'number' ? payload.order : 0,
          createdAt: typeof payload.createdAt === 'number' ? payload.createdAt : row.updatedAt,
        });
      }
      continue;
    }

    if (
      typeof payload.tableName === 'string' &&
      typeof payload.baseSignature === 'string' &&
      payload.state
    ) {
      snapshot.savedDrafts.push({
        normalizedName: row.entityId,
        tableName: payload.tableName,
        state: payload.state as WorkspaceSnapshot['savedDrafts'][number]['state'],
        updatedAt: row.updatedAt,
        baseSignature: payload.baseSignature,
      });
    }
  }

  snapshot.drafts.sort((a, b) => (b.createdAt ?? b.updatedAt) - (a.createdAt ?? a.updatedAt));
  snapshot.savedTables.sort((a, b) => (b.createdAt ?? b.updatedAt) - (a.createdAt ?? a.updatedAt));
  snapshot.savedDrafts.sort((a, b) => b.updatedAt - a.updatedAt);
  snapshot.folders.sort((a, b) => a.order - b.order);

  return snapshot;
};

export const putWorkspaceSnapshotAsEntities = async (
  env: ApiEnv['Bindings'],
  userId: string,
  snapshot: WorkspaceSnapshot,
) => {
  const workspace = await getOrCreateDefaultWorkspace(env, userId);
  const entities = snapshotToEntities(snapshot);
  const nextKeys = new Set(entities.map((item) => `${item.entityType}:${item.entityId}`));
  const currentRows = await listActiveEntities(env, workspace.id);

  for (const entity of entities) {
    await writeEntityVersion(env, {
      userId,
      workspaceId: workspace.id,
      entityType: entity.entityType,
      entityId: entity.entityId,
      op: 'upsert',
      payload: entity.payload,
      contentHash: await buildWorkspaceContentHash(entity.payload),
      updatedAt: entity.sourceUpdatedAt,
    });
  }

  for (const row of currentRows) {
    if (nextKeys.has(`${row.entityType}:${row.entityId}`)) {
      continue;
    }

    await writeEntityVersion(env, {
      userId,
      workspaceId: workspace.id,
      entityType: row.entityType,
      entityId: row.entityId,
      op: 'delete',
      payload: null,
      contentHash: null,
      updatedAt: now(),
    });
  }
};
