import type { WorkspaceMigrationResponse } from '@ddlbuilder/shared-types/api';
import type {
  WorkspaceMigrationPayload,
  WorkspaceSnapshot,
} from '@ddlbuilder/shared-types/workspace';
import type { ApiEnv } from './context.js';
import { getWorkspaceSnapshotFromEntities, upsertWorkspaceEntity } from './workspaceEntities.js';

type MigrationEntityKind = 'global_draft' | 'draft' | 'saved_table' | 'saved_draft' | 'folder';
type ConflictKind = 'draft' | 'saved_table' | 'saved_draft';

type MigrationEntityRecord = {
  id: string;
  kind: MigrationEntityKind;
  normalizedName: string | null;
  displayName: string;
  payloadJson: string;
  sourceUpdatedAt: number;
};

export type WorkspaceMigrationResult = Omit<WorkspaceMigrationResponse, 'meta'>;

const LOCAL_COPY_SUFFIX = ' (Imported)';

const buildMigrationEntityId = (
  userId: string,
  kind: MigrationEntityKind,
  normalizedName: string | null,
) => `${kind}:${userId}:${normalizedName ?? 'global'}`;

const buildMigrationEntityRecord = (
  userId: string,
  kind: MigrationEntityKind,
  normalizedName: string | null,
  displayName: string,
  payload: Record<string, unknown>,
  sourceUpdatedAt: number,
): MigrationEntityRecord => ({
  id: buildMigrationEntityId(userId, kind, normalizedName),
  kind,
  normalizedName,
  displayName,
  payloadJson: JSON.stringify(payload),
  sourceUpdatedAt,
});

const toConflictKind = (kind: MigrationEntityKind): ConflictKind =>
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

const writeMigrationEntity = async (
  env: ApiEnv['Bindings'],
  userId: string,
  record: MigrationEntityRecord,
) => {
  await upsertWorkspaceEntity(env, {
    userId,
    kind: record.kind,
    normalizedName: record.normalizedName,
    payload: JSON.parse(record.payloadJson) as Record<string, unknown>,
    sourceUpdatedAt: record.sourceUpdatedAt,
  });
};

const resolveCopyRecord = (
  userId: string,
  source: MigrationEntityRecord,
  existingPayloads: ReadonlyMap<string, string>,
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
    const candidate = buildMigrationEntityRecord(
      userId,
      targetKind,
      normalizedName,
      displayName,
      payload,
      source.sourceUpdatedAt,
    );
    const existingPayload = existingPayloads.get(candidate.id);
    if (existingPayload === undefined || existingPayload === candidate.payloadJson) {
      return { record: candidate, alreadyExists: existingPayload !== undefined };
    }
    counter += 1;
  }
};

const mergeGlobalDraft = (
  snapshot: WorkspaceSnapshot,
  activeSession?: WorkspaceMigrationPayload['snapshot']['activeSession'],
) => {
  const sessionDraft =
    activeSession?.activeSource.kind === 'draft' && activeSession.activeState
      ? {
          state: activeSession.activeState,
          updatedAt: activeSession.updatedAt,
        }
      : null;

  if (!snapshot.globalDraft) return sessionDraft;
  if (!sessionDraft) return snapshot.globalDraft;
  return snapshot.globalDraft.updatedAt >= sessionDraft.updatedAt
    ? snapshot.globalDraft
    : sessionDraft;
};

const buildMigrationEntityRecords = (
  userId: string,
  snapshot: WorkspaceSnapshot,
  activeSession?: WorkspaceMigrationPayload['snapshot']['activeSession'],
): MigrationEntityRecord[] => {
  const records: MigrationEntityRecord[] = [];
  const globalDraft = mergeGlobalDraft(snapshot, activeSession);

  if (globalDraft) {
    records.push(
      buildMigrationEntityRecord(
        userId,
        'global_draft',
        null,
        'Global Draft',
        { state: globalDraft.state },
        globalDraft.updatedAt,
      ),
    );
  }

  for (const item of snapshot.drafts ?? []) {
    records.push(
      buildMigrationEntityRecord(
        userId,
        'draft',
        item.draftId,
        item.draftId,
        { state: item.state, createdAt: item.createdAt, folderId: item.folderId },
        item.updatedAt,
      ),
    );
  }

  for (const item of snapshot.savedTables) {
    records.push(
      buildMigrationEntityRecord(
        userId,
        'saved_table',
        item.normalizedName,
        item.name,
        { name: item.name, state: item.state, createdAt: item.createdAt, folderId: item.folderId },
        item.updatedAt,
      ),
    );
  }

  for (const item of snapshot.savedDrafts) {
    records.push(
      buildMigrationEntityRecord(
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

  for (const item of snapshot.folders ?? []) {
    records.push(
      buildMigrationEntityRecord(
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

const readExistingEntityPayloads = async (env: ApiEnv['Bindings'], userId: string) =>
  new Map(
    buildMigrationEntityRecords(userId, await getWorkspaceSnapshotFromEntities(env, userId)).map(
      (record) => [record.id, record.payloadJson] as const,
    ),
  );

export const analyzeWorkspaceMigration = async (
  env: ApiEnv['Bindings'],
  userId: string,
  payload: WorkspaceMigrationPayload,
): Promise<WorkspaceMigrationResult> => {
  const records = buildMigrationEntityRecords(
    userId,
    payload.snapshot,
    payload.snapshot.activeSession,
  );
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
  const conflicts: WorkspaceMigrationResult['conflicts'] = [];
  const existingPayloads = await readExistingEntityPayloads(env, userId);

  for (const record of records) {
    const existingPayload = existingPayloads.get(record.id);
    if (existingPayload === undefined) {
      createdCount += 1;
      continue;
    }

    if (existingPayload === record.payloadJson) {
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
  const records = buildMigrationEntityRecords(
    userId,
    payload.snapshot,
    payload.snapshot.activeSession,
  );
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
    const existingPayloads = await readExistingEntityPayloads(env, userId);
    for (const record of records) {
      const existingPayload = existingPayloads.get(record.id);
      if (existingPayload === undefined) {
        await writeMigrationEntity(env, userId, record);
        existingPayloads.set(record.id, record.payloadJson);
        createdCount += 1;
        continue;
      }

      if (existingPayload === record.payloadJson) {
        await upsertWorkspaceEntity(env, {
          userId,
          kind: record.kind,
          normalizedName: record.normalizedName,
          payload: JSON.parse(record.payloadJson) as Record<string, unknown>,
          sourceUpdatedAt: record.sourceUpdatedAt,
        });
        skippedCount += 1;
        continue;
      }

      const copy = resolveCopyRecord(userId, record, existingPayloads);
      await writeMigrationEntity(env, userId, copy.record);
      existingPayloads.set(copy.record.id, copy.record.payloadJson);
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
