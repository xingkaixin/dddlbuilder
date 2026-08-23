import type {
  CurrentWorkspaceResponse,
  WorkspaceEntityType,
  WorkspaceSnapshot,
} from '@ddlbuilder/shared-types/workspace';
import { buildWorkspaceContentHash } from '@ddlbuilder/workspace-core';
import type { ApiEnv } from './context.js';
import { DomainError } from './http.js';
import {
  allWorkspaceD1Result,
  batchWorkspaceD1Results,
  createWorkspaceD1Metrics,
  firstWorkspaceD1Result,
  logWorkspaceD1Metrics,
  type WorkspaceD1Metrics,
} from './workspaceSyncMetrics.js';
import {
  legacyRowsToWorkspaceSnapshot,
  storedEntitiesToWorkspaceSnapshot,
  workspaceSnapshotToEntities,
  type LegacyWorkspaceSnapshotRow,
  type WorkspaceEntityInput,
} from './workspaceEntitySnapshot.js';

type WorkspaceRow = {
  id: string;
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

type EntityKeyRow = {
  entityType: WorkspaceEntityType;
  entityId: string;
};

type EntityVersionInput = {
  userId: string;
  workspaceId: string;
  entityType: WorkspaceEntityType;
  entityId: string;
  op: 'upsert' | 'delete';
  payload: unknown;
  contentHash: string | null;
  updatedAt: number;
};

const DEFAULT_WORKSPACE_NAME = 'Default Workspace';

// 归属校验失败对外一律 403：不区分"不存在"和"不属于你"，避免探测他人 workspace id
export class WorkspaceNotFoundError extends DomainError {
  constructor() {
    super(403, 'WORKSPACE_ACCESS_DENIED', 'WORKSPACE_NOT_FOUND');
    this.name = 'WorkspaceNotFoundError';
  }
}

const now = () => Date.now();

const buildWorkspaceId = () => `ws_${crypto.randomUUID()}`;

const buildEntityRowId = (workspaceId: string, entityType: WorkspaceEntityType, entityId: string) =>
  `${workspaceId}:${entityType}:${entityId}`;

export { buildWorkspaceContentHash };

const readDefaultWorkspace = async (env: ApiEnv['Bindings'], userId: string) =>
  firstWorkspaceD1Result<WorkspaceRow>(
    env.USER_DB.prepare(
      `
      SELECT id
      FROM workspaces
      WHERE user_id = ? AND is_default = 1
      LIMIT 1
    `,
    ).bind(userId),
  );

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
  await batchWorkspaceD1Results(env.USER_DB, [
    env.USER_DB.prepare(
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
      ON CONFLICT DO NOTHING
    `,
    ).bind(workspaceId, userId, DEFAULT_WORKSPACE_NAME, timestamp, timestamp, timestamp),
    env.USER_DB.prepare(
      `
        INSERT INTO workspace_clocks (workspace_id, next_version)
        SELECT id, 0
        FROM workspaces
        WHERE user_id = ? AND is_default = 1
        ON CONFLICT(workspace_id) DO NOTHING
      `,
    ).bind(userId),
  ]);

  const created = await readDefaultWorkspace(env, userId);
  if (!created) {
    throw new Error('Default workspace creation failed');
  }

  return created;
};

export const getCurrentWorkspace = async (
  env: ApiEnv['Bindings'],
  userId: string,
): Promise<CurrentWorkspaceResponse> => ({
  workspaceId: (await getOrCreateDefaultWorkspace(env, userId)).id,
});

export const assertWorkspaceOwner = async (
  env: ApiEnv['Bindings'],
  userId: string,
  workspaceId: string,
  metrics?: WorkspaceD1Metrics,
) => {
  const row = await firstWorkspaceD1Result<{ isDefault: number }>(
    env.USER_DB.prepare(
      `
      SELECT is_default AS isDefault
      FROM workspaces
      WHERE id = ? AND user_id = ?
      LIMIT 1
    `,
    ).bind(workspaceId, userId),
    metrics,
  );

  if (!row) {
    throw new WorkspaceNotFoundError();
  }

  return { isDefault: row.isDefault === 1 };
};

const readWorkspaceCursor = async (
  env: ApiEnv['Bindings'],
  workspaceId: string,
  metrics?: WorkspaceD1Metrics,
) => {
  const row = await firstWorkspaceD1Result<{ cursor: number }>(
    env.USER_DB.prepare(
      `
      SELECT next_version AS cursor
      FROM workspace_clocks
      WHERE workspace_id = ?
      LIMIT 1
    `,
    ).bind(workspaceId),
    metrics,
  );

  return row?.cursor ?? 0;
};

const writeEntityVersions = async (
  env: ApiEnv['Bindings'],
  inputs: EntityVersionInput[],
  metrics?: WorkspaceD1Metrics,
) => {
  if (inputs.length === 0) {
    return null;
  }

  const workspaceId = inputs[0].workspaceId;
  if (inputs.some((input) => input.workspaceId !== workspaceId)) {
    throw new Error('Workspace entity batch must target one workspace');
  }

  const results = await batchWorkspaceD1Results<{ cursor?: number; version?: number }>(
    env.USER_DB,
    [
      env.USER_DB.prepare(
        `
          UPDATE workspace_clocks
          SET next_version = next_version + ?
          WHERE workspace_id = ?
          RETURNING next_version AS cursor
        `,
      ).bind(inputs.length, workspaceId),
      ...inputs.map((input, index) => {
        const deletedAt = input.op === 'delete' ? input.updatedAt : null;
        const payloadJson = input.op === 'delete' ? null : JSON.stringify(input.payload);
        const contentHash = input.op === 'delete' ? null : input.contentHash;
        const versionOffset = inputs.length - index - 1;
        return env.USER_DB.prepare(
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
      SELECT ?, ?, ?, ?, ?, ?, ?, next_version - ?, ?, ?, ?
      FROM workspace_clocks
      WHERE workspace_id = ?
      ON CONFLICT(workspace_id, entity_type, entity_id) DO UPDATE SET
        payload_json = excluded.payload_json,
        content_hash = excluded.content_hash,
        version = excluded.version,
        deleted_at = excluded.deleted_at,
        updated_at = excluded.updated_at
      RETURNING version
    `,
        ).bind(
          buildEntityRowId(input.workspaceId, input.entityType, input.entityId),
          input.workspaceId,
          input.userId,
          input.entityType,
          input.entityId,
          payloadJson,
          contentHash,
          versionOffset,
          deletedAt,
          input.updatedAt,
          input.updatedAt,
          input.workspaceId,
        );
      }),
    ],
    metrics,
  );

  const cursor = Number(results[0]?.results?.[0]?.cursor);
  const versions = results.slice(1).map((result) => Number(result.results?.[0]?.version));
  if (!Number.isFinite(cursor) || versions.some((version) => !Number.isFinite(version))) {
    throw new Error('Workspace entity batch write failed');
  }
  return { cursor, versions };
};

const listEntities = async (
  env: ApiEnv['Bindings'],
  workspaceId: string,
  metrics?: WorkspaceD1Metrics,
) => {
  const result = await allWorkspaceD1Result<EntityRow>(
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
      WHERE workspace_id = ?
      ORDER BY version ASC
    `,
    ).bind(workspaceId),
    metrics,
  );

  return result.results ?? [];
};

const listActiveEntities = async (
  env: ApiEnv['Bindings'],
  workspaceId: string,
  metrics?: WorkspaceD1Metrics,
) => {
  const result = await allWorkspaceD1Result<EntityRow>(
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
      WHERE workspace_id = ? AND deleted_at IS NULL
      ORDER BY version ASC
    `,
    ).bind(workspaceId),
    metrics,
  );

  return result.results ?? [];
};

const listEntityKeys = async (
  env: ApiEnv['Bindings'],
  workspaceId: string,
  metrics?: WorkspaceD1Metrics,
) => {
  const result = await allWorkspaceD1Result<EntityKeyRow>(
    env.USER_DB.prepare(
      `
      SELECT
        entity_type AS entityType,
        entity_id AS entityId
      FROM workspace_entities
      WHERE workspace_id = ?
    `,
    ).bind(workspaceId),
    metrics,
  );

  return result.results ?? [];
};

const listLegacySnapshotRows = async (
  env: ApiEnv['Bindings'],
  userId: string,
  metrics?: WorkspaceD1Metrics,
) => {
  const result = await allWorkspaceD1Result<LegacyWorkspaceSnapshotRow>(
    env.USER_DB.prepare(
      `
      SELECT
        kind,
        normalized_name AS normalizedName,
        payload_json AS payloadJson,
        source_updated_at AS sourceUpdatedAt
      FROM workspace_snapshots
      WHERE user_id = ?
    `,
    ).bind(userId),
    metrics,
  );

  return result.results ?? [];
};

export const upsertDefaultWorkspaceEntities = async (
  env: ApiEnv['Bindings'],
  input: {
    userId: string;
    entities: WorkspaceEntityInput[];
  },
) => {
  const workspace = await getOrCreateDefaultWorkspace(env, input.userId);
  await writeEntityInputs(env, {
    userId: input.userId,
    workspaceId: workspace.id,
    entities: input.entities,
  });
};

const buildEntityKey = (entityType: WorkspaceEntityType, entityId: string) =>
  `${entityType}:${entityId}`;

const writeEntityInputs = async (
  env: ApiEnv['Bindings'],
  input: {
    userId: string;
    workspaceId: string;
    entities: WorkspaceEntityInput[];
  },
  metrics?: WorkspaceD1Metrics,
) => {
  const entities = await Promise.all(
    input.entities.map(async (entity) => ({
      userId: input.userId,
      workspaceId: input.workspaceId,
      entityType: entity.entityType,
      entityId: entity.entityId,
      op: 'upsert' as const,
      payload: entity.payload,
      contentHash: await buildWorkspaceContentHash(entity.payload),
      updatedAt: entity.sourceUpdatedAt,
    })),
  );
  await writeEntityVersions(env, entities, metrics);
};

const backfillLegacySnapshotEntities = async (
  env: ApiEnv['Bindings'],
  userId: string,
  workspaceId: string,
  metrics?: WorkspaceD1Metrics,
) => {
  const legacyRows = await listLegacySnapshotRows(env, userId, metrics);
  if (legacyRows.length === 0) {
    return false;
  }

  const existingRows = await listEntityKeys(env, workspaceId, metrics);
  const existingKeys = new Set(
    existingRows.map((row) => buildEntityKey(row.entityType, row.entityId)),
  );
  const missingLegacyEntities = workspaceSnapshotToEntities(
    legacyRowsToWorkspaceSnapshot(legacyRows),
  ).filter((entity) => !existingKeys.has(buildEntityKey(entity.entityType, entity.entityId)));
  if (missingLegacyEntities.length === 0) {
    return false;
  }

  console.info(
    JSON.stringify({
      event: 'workspace_legacy_backfill',
      userId,
      workspaceId,
      entityCount: missingLegacyEntities.length,
    }),
  );
  await writeEntityInputs(
    env,
    {
      userId,
      workspaceId,
      entities: missingLegacyEntities,
    },
    metrics,
  );
  return true;
};

export const getWorkspaceSnapshotFromEntities = async (
  env: ApiEnv['Bindings'],
  userId: string,
): Promise<WorkspaceSnapshot> => {
  const workspace = await getOrCreateDefaultWorkspace(env, userId);
  await backfillLegacySnapshotEntities(env, userId, workspace.id);
  return storedEntitiesToWorkspaceSnapshot(await listActiveEntities(env, workspace.id));
};

export const getWorkspaceSnapshotForWorkspace = async (
  env: ApiEnv['Bindings'],
  userId: string,
  workspaceId: string,
): Promise<WorkspaceSnapshot> => {
  const workspace = await assertWorkspaceOwner(env, userId, workspaceId);
  if (workspace.isDefault) {
    await backfillLegacySnapshotEntities(env, userId, workspaceId);
  }
  return storedEntitiesToWorkspaceSnapshot(await listActiveEntities(env, workspaceId));
};

export const putWorkspaceSnapshotAsEntities = async (
  env: ApiEnv['Bindings'],
  userId: string,
  snapshot: WorkspaceSnapshot,
) => {
  await upsertDefaultWorkspaceEntities(env, {
    userId,
    entities: workspaceSnapshotToEntities(snapshot),
  });
};

export const checkpointWorkspaceSnapshotEntities = async (
  env: ApiEnv['Bindings'],
  userId: string,
  workspaceId: string,
  snapshot: WorkspaceSnapshot,
) => {
  const metrics = createWorkspaceD1Metrics();
  await assertWorkspaceOwner(env, userId, workspaceId, metrics);
  const entities = workspaceSnapshotToEntities(snapshot);
  const [hashedEntities, existingRows] = await Promise.all([
    Promise.all(
      entities.map(async (entity) => ({
        ...entity,
        contentHash: await buildWorkspaceContentHash(entity.payload),
      })),
    ),
    listEntities(env, workspaceId, metrics),
  ]);
  const existingByKey = new Map(
    existingRows.map((row) => [buildEntityKey(row.entityType, row.entityId), row]),
  );
  const nextKeys = new Set(
    hashedEntities.map((entity) => buildEntityKey(entity.entityType, entity.entityId)),
  );
  const writes: EntityVersionInput[] = [];
  let upserted = 0;
  let deleted = 0;
  let skipped = 0;

  for (const entity of hashedEntities) {
    const existing = existingByKey.get(buildEntityKey(entity.entityType, entity.entityId));
    if (existing && existing.deletedAt == null && existing.contentHash === entity.contentHash) {
      skipped++;
      continue;
    }

    writes.push({
      userId,
      workspaceId,
      entityType: entity.entityType,
      entityId: entity.entityId,
      op: 'upsert',
      payload: entity.payload,
      contentHash: entity.contentHash,
      updatedAt: entity.sourceUpdatedAt,
    });
    upserted++;
  }

  const checkpointedAt = now();
  for (const row of existingRows) {
    if (row.deletedAt != null || nextKeys.has(buildEntityKey(row.entityType, row.entityId))) {
      continue;
    }

    writes.push({
      userId,
      workspaceId,
      entityType: row.entityType,
      entityId: row.entityId,
      op: 'delete',
      payload: null,
      contentHash: null,
      updatedAt: checkpointedAt,
    });
    deleted++;
  }

  const writeResult = await writeEntityVersions(env, writes, metrics);
  const response = {
    cursor: writeResult?.cursor ?? (await readWorkspaceCursor(env, workspaceId, metrics)),
    upserted,
    deleted,
    skipped,
  };
  logWorkspaceD1Metrics(
    'checkpoint',
    {
      workspaceId,
      entityCount: entities.length,
      upserted,
      deleted,
      skipped,
    },
    metrics,
  );
  return response;
};
