import type { PersistedState } from '@ddlbuilder/shared-types';
import type { WorkspaceSource } from '@ddlbuilder/shared-types/workspace';
import type { ApiEnv } from './context.js';

type SnapshotKind = 'global_draft' | 'saved_table' | 'saved_draft';

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
      updatedAt: number;
    }>;
    savedDrafts: Array<{
      normalizedName: string;
      tableName: string;
      state: PersistedState;
      updatedAt: number;
      baseSignature: string;
    }>;
  };
};

export type WorkspaceMigrationConflict = {
  kind: SnapshotKind;
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

const listSnapshotNames = async (env: ApiEnv['Bindings'], userId: string, kind: SnapshotKind) => {
  const result = await env.USER_DB.prepare(
    `
      SELECT normalized_name AS normalizedName
      FROM workspace_snapshots
      WHERE user_id = ? AND kind = ? AND normalized_name IS NOT NULL
    `,
  )
    .bind(userId, kind)
    .all<{ normalizedName: string }>();

  return new Set(
    (result.results ?? [])
      .map((item) => item.normalizedName)
      .filter((value): value is string => typeof value === 'string' && value.length > 0),
  );
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
};

const resolveUniqueName = async (
  env: ApiEnv['Bindings'],
  userId: string,
  kind: SnapshotKind,
  baseName: string,
) => {
  const existing = await listSnapshotNames(env, userId, kind);
  let counter = 0;
  let candidate = buildLocalCopyName(baseName, counter);
  let normalizedCandidate = normalizeName(candidate);
  while (existing.has(normalizedCandidate)) {
    counter += 1;
    candidate = buildLocalCopyName(baseName, counter);
    normalizedCandidate = normalizeName(candidate);
  }
  return {
    displayName: candidate,
    normalizedName: normalizedCandidate,
  };
};

const mergeGlobalDraft = (payload: WorkspaceMigrationPayload['snapshot']) => {
  const sessionDraft =
    payload.activeSession?.activeSource.kind === 'global_draft' && payload.activeSession.activeState
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

  for (const item of payload.snapshot.savedTables) {
    records.push(
      buildSnapshotRecord(
        userId,
        'saved_table',
        item.normalizedName,
        item.name,
        { name: item.name, state: item.state },
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
      kind: record.kind,
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
        skippedCount += 1;
        continue;
      }

      if (record.kind === 'global_draft') {
        const copyName = await resolveUniqueName(env, userId, 'saved_draft', 'Migrated draft');
        await writeSnapshot(
          env,
          userId,
          buildSnapshotRecord(
            userId,
            'saved_draft',
            copyName.normalizedName,
            copyName.displayName,
            {
              tableName: copyName.displayName,
              baseSignature: '',
              state: JSON.parse(record.payloadJson).state,
            },
            record.sourceUpdatedAt,
          ),
        );
        copiedCount += 1;
        continue;
      }

      const copyName = await resolveUniqueName(env, userId, record.kind, record.displayName);
      const payloadJson = JSON.stringify({
        ...JSON.parse(record.payloadJson),
        name: copyName.displayName,
        tableName: copyName.displayName,
      });
      await writeSnapshot(env, userId, {
        ...record,
        id: buildSnapshotId(userId, record.kind, copyName.normalizedName),
        normalizedName: copyName.normalizedName,
        displayName: copyName.displayName,
        payloadJson,
      });
      copiedCount += 1;
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
