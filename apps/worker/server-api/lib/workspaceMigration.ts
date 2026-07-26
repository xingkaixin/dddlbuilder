import type { PersistedState } from '@ddlbuilder/shared-types';
import type { WorkspaceSource } from '@ddlbuilder/shared-types/workspace';
import type { ApiEnv } from './context.js';
import { upsertWorkspaceSnapshotEntity } from './workspaceEntities.js';

type SnapshotKind = 'global_draft' | 'draft' | 'saved_table' | 'saved_draft' | 'folder';
type ConflictKind = 'draft' | 'saved_table' | 'saved_draft';

type SnapshotRecord = {
  id: string;
  kind: SnapshotKind;
  normalizedName: string | null;
  displayName: string;
  payloadJson: string;
  sourceUpdatedAt: number;
};

export type WorkspaceMigrationPayload = {
  localFingerprint: string;
  idempotencyKey: string;
  snapshot: {
    globalDraft: {
      state: PersistedState;
      updatedAt: number;
    } | null;
    activeSession: {
      activeSource: WorkspaceSource;
      activeState: PersistedState | null;
      updatedAt: number;
    } | null;
    savedTables: Array<{
      normalizedName: string;
      name: string;
      state: PersistedState;
      createdAt?: number;
      updatedAt: number;
      folderId?: string;
    }>;
    drafts?: Array<{
      draftId: string;
      state: PersistedState;
      createdAt?: number;
      updatedAt: number;
      folderId?: string;
    }>;
    savedDrafts: Array<{
      normalizedName: string;
      tableName: string;
      state: PersistedState;
      updatedAt: number;
      baseSignature: string;
    }>;
    folders?: Array<{
      id: string;
      name: string;
      parentId?: string;
      order: number;
      createdAt: number;
    }>;
  };
};

export type WorkspaceMigrationConflict = {
  kind: ConflictKind;
  normalizedName: string | null;
  displayName: string;
};

export type WorkspaceMigrationResult = {
  status: 'no_data' | 'ready' | 'completed';
  createdCount: number;
  copiedCount: number;
  skippedCount: number;
  conflictCount: number;
  conflicts: WorkspaceMigrationConflict[];
};

const LOCAL_COPY_SUFFIX = ' (Imported)';

const buildSnapshotId = (userId: string, kind: SnapshotKind, normalizedName: string | null) =>
  `${kind}:${userId}:${normalizedName ?? 'global'}`;

const buildSnapshotRecord = (
  userId: string,
  kind: SnapshotKind,
  normalizedName: string | null,
  displayName: string,
  payload: Record<string, unknown>,
  sourceUpdatedAt: number,
): SnapshotRecord => ({
  id: buildSnapshotId(userId, kind, normalizedName),
  kind,
  normalizedName,
  displayName,
  payloadJson: JSON.stringify(payload),
  sourceUpdatedAt,
});

const toConflictKind = (kind: SnapshotKind): ConflictKind =>
  kind === 'global_draft' || kind === 'folder' ? 'draft' : kind;

const normalizeName = (value: string) => value.trim().toLowerCase();

const buildLocalCopyName = (baseName: string, counter: number) =>
  counter === 0
    ? `${baseName}${LOCAL_COPY_SUFFIX}`
    : `${baseName}${LOCAL_COPY_SUFFIX} ${counter + 1}`;

const readWorkspaceLink = async (
  env: ApiEnv['Bindings'],
  userId: string,
  localFingerprint: string,
) => {
  return env.USER_DB.prepare(
    `
      SELECT migration_status AS migrationStatus
      FROM workspace_links
      WHERE user_id = ? AND local_fingerprint = ?
      LIMIT 1
    `,
  )
    .bind(userId, localFingerprint)
    .first<{ migrationStatus: string }>();
};

const upsertWorkspaceLink = async (
  env: ApiEnv['Bindings'],
  input: {
    userId: string;
    localFingerprint: string;
    migrationStatus: 'pending' | 'completed' | 'failed';
    idempotencyKey: string;
  },
) => {
  await env.USER_DB.prepare(
    `
      INSERT INTO workspace_links (
        id,
        user_id,
        local_fingerprint,
        migration_status,
        last_idempotency_key,
        migrated_at
      )
      VALUES (?, ?, ?, ?, ?, CASE WHEN ? = 'completed' THEN CURRENT_TIMESTAMP ELSE NULL END)
      ON CONFLICT(user_id, local_fingerprint) DO UPDATE SET
        migration_status = excluded.migration_status,
        last_idempotency_key = excluded.last_idempotency_key,
        migrated_at = CASE
          WHEN excluded.migration_status = 'completed' THEN CURRENT_TIMESTAMP
          ELSE workspace_links.migrated_at
        END
    `,
  )
    .bind(
      `workspace-link:${input.userId}:${input.localFingerprint}`,
      input.userId,
      input.localFingerprint,
      input.migrationStatus,
      input.idempotencyKey,
      input.migrationStatus,
    )
    .run();
};

const findExistingSnapshot = async (
  env: ApiEnv['Bindings'],
  userId: string,
  kind: SnapshotKind,
  normalizedName: string | null,
) => {
  return env.USER_DB.prepare(
    `
      SELECT
        id,
        kind,
        normalized_name AS normalizedName,
        payload_json AS payloadJson,
        source_updated_at AS sourceUpdatedAt
      FROM workspace_snapshots
      WHERE user_id = ? AND kind = ? AND normalized_name IS ?
      LIMIT 1
    `,
  )
    .bind(userId, kind, normalizedName)
    .first<{
      id: string;
      kind: SnapshotKind;
      normalizedName: string | null;
      payloadJson: string;
      sourceUpdatedAt: number;
    }>();
};

const writeSnapshot = async (env: ApiEnv['Bindings'], userId: string, record: SnapshotRecord) => {
  await env.USER_DB.prepare(
    `
      INSERT INTO workspace_snapshots (
        id,
        user_id,
        kind,
        normalized_name,
        payload_json,
        source_updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        payload_json = excluded.payload_json,
        source_updated_at = excluded.source_updated_at,
        updated_at = CURRENT_TIMESTAMP
    `,
  )
    .bind(
      record.id,
      userId,
      record.kind,
      record.normalizedName,
      record.payloadJson,
      record.sourceUpdatedAt,
    )
    .run();

  await upsertWorkspaceSnapshotEntity(env, {
    userId,
    kind: record.kind,
    normalizedName: record.normalizedName,
    payload: JSON.parse(record.payloadJson) as Record<string, unknown>,
    sourceUpdatedAt: record.sourceUpdatedAt,
  });
};

const resolveCopyRecord = async (
  env: ApiEnv['Bindings'],
  userId: string,
  source: SnapshotRecord,
) => {
  const targetKind = source.kind === 'global_draft' ? 'saved_draft' : source.kind;
  const baseName = source.kind === 'global_draft' ? 'Migrated draft' : source.displayName;
  const sourcePayload = JSON.parse(source.payloadJson) as Record<string, unknown>;
  let counter = 0;
  while (true) {
    const displayName = buildLocalCopyName(baseName, counter);
    const normalizedName = normalizeName(displayName);
    const payload =
      source.kind === 'global_draft'
        ? {
            tableName: displayName,
            baseSignature: '',
            state: sourcePayload.state,
          }
        : {
            ...sourcePayload,
            name: displayName,
            tableName: displayName,
          };
    const candidate = buildSnapshotRecord(
      userId,
      targetKind,
      normalizedName,
      displayName,
      payload,
      source.sourceUpdatedAt,
    );
    const existing = await findExistingSnapshot(env, userId, targetKind, normalizedName);
    if (!existing || existing.payloadJson === candidate.payloadJson) {
      return { record: candidate, alreadyExists: Boolean(existing) };
    }
    counter += 1;
  }
};

const mergeGlobalDraft = (payload: WorkspaceMigrationPayload['snapshot']) => {
  const sessionDraft =
    payload.activeSession?.activeSource.kind === 'draft' && payload.activeSession.activeState
      ? {
          state: payload.activeSession.activeState,
          updatedAt: payload.activeSession.updatedAt,
        }
      : null;

  if (!payload.globalDraft) return sessionDraft;
  if (!sessionDraft) return payload.globalDraft;
  return payload.globalDraft.updatedAt >= sessionDraft.updatedAt
    ? payload.globalDraft
    : sessionDraft;
};

const buildSnapshotRecords = (
  userId: string,
  payload: WorkspaceMigrationPayload,
): SnapshotRecord[] => {
  const records: SnapshotRecord[] = [];
  const globalDraft = mergeGlobalDraft(payload.snapshot);

  if (globalDraft) {
    records.push(
      buildSnapshotRecord(
        userId,
        'global_draft',
        null,
        'Global Draft',
        { state: globalDraft.state },
        globalDraft.updatedAt,
      ),
    );
  }

  for (const item of payload.snapshot.drafts ?? []) {
    records.push(
      buildSnapshotRecord(
        userId,
        'draft',
        item.draftId,
        item.draftId,
        { state: item.state, createdAt: item.createdAt, folderId: item.folderId },
        item.updatedAt,
      ),
    );
  }

  for (const item of payload.snapshot.savedTables) {
    records.push(
      buildSnapshotRecord(
        userId,
        'saved_table',
        item.normalizedName,
        item.name,
        { name: item.name, state: item.state, createdAt: item.createdAt, folderId: item.folderId },
        item.updatedAt,
      ),
    );
  }

  for (const item of payload.snapshot.savedDrafts) {
    records.push(
      buildSnapshotRecord(
        userId,
        'saved_draft',
        item.normalizedName,
        item.tableName,
        {
          tableName: item.tableName,
          baseSignature: item.baseSignature,
          state: item.state,
        },
        item.updatedAt,
      ),
    );
  }

  for (const item of payload.snapshot.folders ?? []) {
    records.push(
      buildSnapshotRecord(
        userId,
        'folder',
        item.id,
        item.name,
        {
          id: item.id,
          name: item.name,
          parentId: item.parentId,
          order: item.order,
          createdAt: item.createdAt,
        },
        item.createdAt,
      ),
    );
  }

  return records;
};

export const analyzeWorkspaceMigration = async (
  env: ApiEnv['Bindings'],
  userId: string,
  payload: WorkspaceMigrationPayload,
): Promise<WorkspaceMigrationResult> => {
  const records = buildSnapshotRecords(userId, payload);
  if (records.length === 0) {
    return {
      status: 'no_data',
      createdCount: 0,
      copiedCount: 0,
      skippedCount: 0,
      conflictCount: 0,
      conflicts: [],
    };
  }

  const existingLink = await readWorkspaceLink(env, userId, payload.localFingerprint);
  if (existingLink?.migrationStatus === 'completed') {
    return {
      status: 'completed',
      createdCount: 0,
      copiedCount: 0,
      skippedCount: records.length,
      conflictCount: 0,
      conflicts: [],
    };
  }

  let createdCount = 0;
  let skippedCount = 0;
  const conflicts: WorkspaceMigrationConflict[] = [];

  for (const record of records) {
    const existing = await findExistingSnapshot(env, userId, record.kind, record.normalizedName);
    if (!existing) {
      createdCount += 1;
      continue;
    }

    if (existing.payloadJson === record.payloadJson) {
      skippedCount += 1;
      continue;
    }

    conflicts.push({
      kind: toConflictKind(record.kind),
      normalizedName: record.normalizedName,
      displayName: record.displayName,
    });
  }

  return {
    status: 'ready',
    createdCount,
    copiedCount: 0,
    skippedCount,
    conflictCount: conflicts.length,
    conflicts,
  };
};

export const commitWorkspaceMigration = async (
  env: ApiEnv['Bindings'],
  userId: string,
  payload: WorkspaceMigrationPayload,
): Promise<WorkspaceMigrationResult> => {
  const records = buildSnapshotRecords(userId, payload);
  if (records.length === 0) {
    return {
      status: 'no_data',
      createdCount: 0,
      copiedCount: 0,
      skippedCount: 0,
      conflictCount: 0,
      conflicts: [],
    };
  }

  const existingLink = await readWorkspaceLink(env, userId, payload.localFingerprint);
  if (existingLink?.migrationStatus === 'completed') {
    return {
      status: 'completed',
      createdCount: 0,
      copiedCount: 0,
      skippedCount: records.length,
      conflictCount: 0,
      conflicts: [],
    };
  }

  await upsertWorkspaceLink(env, {
    userId,
    localFingerprint: payload.localFingerprint,
    migrationStatus: 'pending',
    idempotencyKey: payload.idempotencyKey,
  });

  let createdCount = 0;
  let copiedCount = 0;
  let skippedCount = 0;

  try {
    for (const record of records) {
      const existing = await findExistingSnapshot(env, userId, record.kind, record.normalizedName);
      if (!existing) {
        await writeSnapshot(env, userId, record);
        createdCount += 1;
        continue;
      }

      if (existing.payloadJson === record.payloadJson) {
        await upsertWorkspaceSnapshotEntity(env, {
          userId,
          kind: record.kind,
          normalizedName: record.normalizedName,
          payload: JSON.parse(record.payloadJson) as Record<string, unknown>,
          sourceUpdatedAt: record.sourceUpdatedAt,
        });
        skippedCount += 1;
        continue;
      }

      const copy = await resolveCopyRecord(env, userId, record);
      await writeSnapshot(env, userId, copy.record);
      if (copy.alreadyExists) {
        skippedCount += 1;
      } else {
        copiedCount += 1;
      }
    }

    await upsertWorkspaceLink(env, {
      userId,
      localFingerprint: payload.localFingerprint,
      migrationStatus: 'completed',
      idempotencyKey: payload.idempotencyKey,
    });

    return {
      status: 'completed',
      createdCount,
      copiedCount,
      skippedCount,
      conflictCount: 0,
      conflicts: [],
    };
  } catch (error) {
    await upsertWorkspaceLink(env, {
      userId,
      localFingerprint: payload.localFingerprint,
      migrationStatus: 'failed',
      idempotencyKey: payload.idempotencyKey,
    });
    throw error;
  }
};
