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
import { buildWorkspaceContentHash } from '@ddlbuilder/workspace-core';
import type { ApiEnv } from './context.js';
import {
  allWorkspaceD1Result,
  batchWorkspaceD1Results,
  createWorkspaceD1Metrics,
  firstWorkspaceD1Result,
  logWorkspaceD1Metrics,
  runWorkspaceD1Result,
  type WorkspaceD1Metrics,
} from './workspaceSyncMetrics.js';
import {
  GLOBAL_DRAFT_ENTITY_ID,
  legacyRowsToWorkspaceSnapshot,
  storedEntitiesToWorkspaceSnapshot,
  workspaceSnapshotToEntities,
  type LegacyWorkspaceSnapshotRow,
  type WorkspaceEntityInput,
} from './workspaceEntitySnapshot.js';

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

type EntityKeyRow = {
  entityType: WorkspaceEntityType;
  entityId: string;
};

type MutationRow = {
  entityType: WorkspaceEntityType;
  entityId: string;
  version: number;
};

const DEFAULT_WORKSPACE_NAME = 'Default Workspace';

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

export { buildWorkspaceContentHash };

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
  firstWorkspaceD1Result<WorkspaceRow>(
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

export const assertWorkspaceOwner = async (
  env: ApiEnv['Bindings'],
  userId: string,
  workspaceId: string,
  metrics?: WorkspaceD1Metrics,
) => {
  const row = await firstWorkspaceD1Result<{ id: string }>(
    env.USER_DB.prepare(
      `
      SELECT id
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

const readEntity = async (
  env: ApiEnv['Bindings'],
  workspaceId: string,
  entityType: WorkspaceEntityType,
  entityId: string,
  metrics?: WorkspaceD1Metrics,
) =>
  firstWorkspaceD1Result<EntityRow>(
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
    ).bind(workspaceId, entityType, entityId),
    metrics,
  );

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
  metrics?: WorkspaceD1Metrics,
) => {
  const deletedAt = input.op === 'delete' ? input.updatedAt : null;
  const payloadJson = input.op === 'delete' ? null : JSON.stringify(input.payload);
  const contentHash = input.op === 'delete' ? null : input.contentHash;
  const results = await batchWorkspaceD1Results<{ version: number }>(
    env.USER_DB,
    [
      env.USER_DB.prepare(
        `
          UPDATE workspace_clocks
          SET next_version = next_version + 1
          WHERE workspace_id = ?
        `,
      ).bind(input.workspaceId),
      env.USER_DB.prepare(
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
      SELECT ?, ?, ?, ?, ?, ?, ?, next_version, ?, ?, ?
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
        deletedAt,
        input.updatedAt,
        input.updatedAt,
        input.workspaceId,
      ),
    ],
    metrics,
  );
  const row = results[1]?.results?.[0];
  if (!row) {
    throw new Error('Workspace entity write failed');
  }
  return Number(row.version);
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
  metrics?: WorkspaceD1Metrics,
) => {
  const result = await runWorkspaceD1Result(
    env.USER_DB.prepare(
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
    ).bind(
      buildMutationRowId(input.workspaceId, input.clientMutationId),
      input.workspaceId,
      input.userId,
      input.clientMutationId,
      input.entityType,
      input.entityId,
      input.version,
      now(),
    ),
    metrics,
  );

  if (!result.success) {
    throw new Error(result.error ?? 'D1 execution failed');
  }
  const mutation = await readMutation(env, input.workspaceId, input.clientMutationId, metrics);
  if (!mutation) {
    throw new Error('Workspace mutation write failed');
  }
  return mutation;
};

const readMutation = async (
  env: ApiEnv['Bindings'],
  workspaceId: string,
  clientMutationId: string,
  metrics?: WorkspaceD1Metrics,
) =>
  firstWorkspaceD1Result<MutationRow>(
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
    ).bind(workspaceId, clientMutationId),
    metrics,
  );

const commitWorkspaceChange = async (
  env: ApiEnv['Bindings'],
  input: {
    userId: string;
    workspaceId: string;
    clientMutationId: string;
    entityType: WorkspaceEntityType;
    entityId: string;
    op: WorkspaceEntityOperation;
    baseVersion: number | null;
    payload: unknown;
    contentHash: string | null;
    updatedAt: number;
  },
  metrics?: WorkspaceD1Metrics,
) => {
  const deletedAt = input.op === 'delete' ? input.updatedAt : null;
  const payloadJson = input.op === 'delete' ? null : JSON.stringify(input.payload);
  const contentHash = input.op === 'delete' ? null : input.contentHash;
  const mutationId = buildMutationRowId(input.workspaceId, input.clientMutationId);

  await batchWorkspaceD1Results(
    env.USER_DB,
    [
      env.USER_DB.prepare(
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
          SELECT ?, ?, ?, ?, ?, ?, 0, ?
          WHERE NOT EXISTS (
            SELECT 1
            FROM workspace_mutations
            WHERE workspace_id = ? AND client_mutation_id = ?
          )
          AND (
            NOT EXISTS (
              SELECT 1
              FROM workspace_entities
              WHERE workspace_id = ? AND entity_type = ? AND entity_id = ?
            )
            OR EXISTS (
              SELECT 1
              FROM workspace_entities
              WHERE workspace_id = ? AND entity_type = ? AND entity_id = ? AND version IS ?
            )
          )
        `,
      ).bind(
        mutationId,
        input.workspaceId,
        input.userId,
        input.clientMutationId,
        input.entityType,
        input.entityId,
        input.updatedAt,
        input.workspaceId,
        input.clientMutationId,
        input.workspaceId,
        input.entityType,
        input.entityId,
        input.workspaceId,
        input.entityType,
        input.entityId,
        input.baseVersion,
      ),
      env.USER_DB.prepare(
        `
          UPDATE workspace_clocks
          SET next_version = next_version + 1
          WHERE workspace_id = ?
            AND EXISTS (
              SELECT 1
              FROM workspace_mutations
              WHERE id = ? AND version = 0
            )
        `,
      ).bind(input.workspaceId, mutationId),
      env.USER_DB.prepare(
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
          SELECT ?, ?, ?, ?, ?, ?, ?, workspace_clocks.next_version, ?, ?, ?
          FROM workspace_clocks
          WHERE workspace_id = ?
            AND EXISTS (
              SELECT 1
              FROM workspace_mutations
              WHERE id = ? AND version = 0
            )
          ON CONFLICT(workspace_id, entity_type, entity_id) DO UPDATE SET
            payload_json = excluded.payload_json,
            content_hash = excluded.content_hash,
            version = excluded.version,
            deleted_at = excluded.deleted_at,
            updated_at = excluded.updated_at
        `,
      ).bind(
        buildEntityRowId(input.workspaceId, input.entityType, input.entityId),
        input.workspaceId,
        input.userId,
        input.entityType,
        input.entityId,
        payloadJson,
        contentHash,
        deletedAt,
        input.updatedAt,
        input.updatedAt,
        input.workspaceId,
        mutationId,
      ),
      env.USER_DB.prepare(
        `
          UPDATE workspace_mutations
          SET version = (
            SELECT next_version
            FROM workspace_clocks
            WHERE workspace_id = ?
          )
          WHERE id = ? AND version = 0
        `,
      ).bind(input.workspaceId, mutationId),
    ],
    metrics,
  );

  return readMutation(env, input.workspaceId, input.clientMutationId, metrics);
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

export const getWorkspaceChanges = async (
  env: ApiEnv['Bindings'],
  userId: string,
  workspaceId: string,
  since: number,
): Promise<WorkspaceChangesResponse> => {
  const metrics = createWorkspaceD1Metrics();
  await assertWorkspaceOwner(env, userId, workspaceId, metrics);
  await backfillLegacySnapshotEntities(env, userId, workspaceId, metrics);
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
      WHERE workspace_id = ? AND version > ?
      ORDER BY version ASC
    `,
    ).bind(workspaceId, since),
    metrics,
  );

  const response = {
    workspaceId,
    cursor: await readWorkspaceCursor(env, workspaceId, metrics),
    entities: (result.results ?? []).map((row) => toEnvelope(workspaceId, row)),
  };
  logWorkspaceD1Metrics(
    'changes_pull',
    {
      userId,
      workspaceId,
      since,
      entityCount: response.entities.length,
    },
    metrics,
  );
  return response;
};

export const pushWorkspaceChanges = async (
  env: ApiEnv['Bindings'],
  userId: string,
  workspaceId: string,
  request: WorkspaceChangesPushRequest,
): Promise<WorkspaceChangesPushResponse> => {
  const metrics = createWorkspaceD1Metrics();
  await assertWorkspaceOwner(env, userId, workspaceId, metrics);
  const accepted: WorkspaceChangesPushResponse['accepted'] = [];
  const conflicts: WorkspaceChangesPushResponse['conflicts'] = [];

  for (const change of request.changes) {
    const mutation = await readMutation(env, workspaceId, change.clientMutationId, metrics);
    if (mutation) {
      accepted.push({
        clientMutationId: change.clientMutationId,
        entityType: mutation.entityType,
        entityId: mutation.entityId,
        version: mutation.version,
      });
      continue;
    }

    const existing = await readEntity(
      env,
      workspaceId,
      change.entityType,
      change.entityId,
      metrics,
    );
    const sameContent =
      existing &&
      ((change.op === 'delete' && existing.deletedAt != null) ||
        (change.op === 'upsert' &&
          existing.deletedAt == null &&
          existing.contentHash === change.contentHash));

    if (sameContent) {
      const committedMutation = await writeMutation(
        env,
        {
          userId,
          workspaceId,
          clientMutationId: change.clientMutationId,
          entityType: change.entityType,
          entityId: change.entityId,
          version: existing.version,
        },
        metrics,
      );
      accepted.push({
        clientMutationId: change.clientMutationId,
        entityType: committedMutation.entityType,
        entityId: committedMutation.entityId,
        version: committedMutation.version,
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

    const committedMutation = await commitWorkspaceChange(
      env,
      {
        userId,
        workspaceId,
        clientMutationId: change.clientMutationId,
        entityType: change.entityType,
        entityId: change.entityId,
        op: change.op,
        baseVersion: change.baseVersion,
        payload: change.payload,
        contentHash: change.contentHash,
        updatedAt: now(),
      },
      metrics,
    );
    if (!committedMutation) {
      const current = await readEntity(
        env,
        workspaceId,
        change.entityType,
        change.entityId,
        metrics,
      );
      if (!current) {
        throw new Error('Workspace change was not committed');
      }
      conflicts.push({
        clientMutationId: change.clientMutationId,
        entityType: change.entityType,
        entityId: change.entityId,
        serverVersion: current.version,
        serverContentHash: current.contentHash,
        serverPayload: parseEntityPayload(current),
      });
      continue;
    }
    accepted.push({
      clientMutationId: change.clientMutationId,
      entityType: committedMutation.entityType,
      entityId: committedMutation.entityId,
      version: committedMutation.version,
    });
  }

  const response = {
    cursor: await readWorkspaceCursor(env, workspaceId, metrics),
    accepted,
    conflicts,
  };
  logWorkspaceD1Metrics(
    'changes_push',
    {
      userId,
      workspaceId,
      changeCount: request.changes.length,
      acceptedCount: accepted.length,
      conflictCount: conflicts.length,
    },
    metrics,
  );
  return response;
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
  for (const entity of input.entities) {
    await writeEntityVersion(
      env,
      {
        userId: input.userId,
        workspaceId: input.workspaceId,
        entityType: entity.entityType,
        entityId: entity.entityId,
        op: 'upsert',
        payload: entity.payload,
        contentHash: await buildWorkspaceContentHash(entity.payload),
        updatedAt: entity.sourceUpdatedAt,
      },
      metrics,
    );
  }
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
  await assertWorkspaceOwner(env, userId, workspaceId);
  await backfillLegacySnapshotEntities(env, userId, workspaceId);
  return storedEntitiesToWorkspaceSnapshot(await listActiveEntities(env, workspaceId));
};

export const putWorkspaceSnapshotAsEntities = async (
  env: ApiEnv['Bindings'],
  userId: string,
  snapshot: WorkspaceSnapshot,
) => {
  const workspace = await getOrCreateDefaultWorkspace(env, userId);
  await writeEntityInputs(env, {
    userId,
    workspaceId: workspace.id,
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
  const nextKeys = new Set(
    entities.map((entity) => buildEntityKey(entity.entityType, entity.entityId)),
  );
  let upserted = 0;
  let deleted = 0;
  let skipped = 0;

  for (const entity of entities) {
    const contentHash = await buildWorkspaceContentHash(entity.payload);
    const existing = await readEntity(
      env,
      workspaceId,
      entity.entityType,
      entity.entityId,
      metrics,
    );
    if (existing && existing.deletedAt == null && existing.contentHash === contentHash) {
      skipped++;
      continue;
    }

    await writeEntityVersion(
      env,
      {
        userId,
        workspaceId,
        entityType: entity.entityType,
        entityId: entity.entityId,
        op: 'upsert',
        payload: entity.payload,
        contentHash,
        updatedAt: entity.sourceUpdatedAt,
      },
      metrics,
    );
    upserted++;
  }

  const activeRows = await listActiveEntities(env, workspaceId, metrics);
  const checkpointedAt = now();
  for (const row of activeRows) {
    if (nextKeys.has(buildEntityKey(row.entityType, row.entityId))) {
      continue;
    }

    await writeEntityVersion(
      env,
      {
        userId,
        workspaceId,
        entityType: row.entityType,
        entityId: row.entityId,
        op: 'delete',
        payload: null,
        contentHash: null,
        updatedAt: checkpointedAt,
      },
      metrics,
    );
    deleted++;
  }

  const response = {
    cursor: await readWorkspaceCursor(env, workspaceId, metrics),
    upserted,
    deleted,
    skipped,
  };
  logWorkspaceD1Metrics(
    'checkpoint',
    {
      userId,
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
