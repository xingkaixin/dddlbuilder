import type * as Y from 'yjs';
import {
  exportWorkspaceYDocToSnapshot,
  mergeWorkspaceSnapshotIntoYDoc,
  normalizeWorkspaceMigrationSnapshot,
} from '@ddlbuilder/workspace-core';
import type { WorkspaceMigrationResponse } from '@ddlbuilder/shared-types/api';
import type {
  WorkspaceMigrationPayload,
  WorkspaceMigrationSnapshot,
} from '@ddlbuilder/shared-types/workspace';
import type { ApiEnv } from './context.js';
import { openDefaultWorkspaceYDocAuthority } from './workspaceYDocAuthority.js';
import { storedEntitiesToWorkspaceSnapshot } from './workspaceEntitySnapshot.js';
import {
  analyzeMigrationRecords,
  buildMigrationEntityRecords,
  buildMigrationWritePlan,
} from './workspaceMigrationPlan.js';

export type WorkspaceMigrationResult = Omit<WorkspaceMigrationResponse, 'meta'>;

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

const recordCompletedWorkspaceMigration = async (
  env: ApiEnv['Bindings'],
  input: {
    userId: string;
    localFingerprint: string;
    idempotencyKey: string;
  },
) => {
  const now = Date.now();
  await env.USER_DB.prepare(
    `
      INSERT INTO workspace_links (
        id,
        user_id,
        local_fingerprint,
        migration_status,
        last_idempotency_key,
        migrated_at,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, local_fingerprint) DO UPDATE SET
        migration_status = excluded.migration_status,
        last_idempotency_key = excluded.last_idempotency_key,
        migrated_at = excluded.migrated_at
    `,
  )
    .bind(
      `workspace-link:${input.userId}:${input.localFingerprint}`,
      input.userId,
      input.localFingerprint,
      'completed',
      input.idempotencyKey,
      now,
      now,
    )
    .run();
};

export const analyzeWorkspaceMigration = async (
  env: ApiEnv['Bindings'],
  userId: string,
  payload: WorkspaceMigrationPayload,
): Promise<WorkspaceMigrationResult> => {
  const records = buildMigrationEntityRecords(
    userId,
    normalizeWorkspaceMigrationSnapshot(payload.snapshot),
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

  const authority = await openDefaultWorkspaceYDocAuthority(env, userId);
  const analysis = analyzeMigrationRecords(
    records,
    buildMigrationEntityRecords(userId, await authority.readSnapshot()),
  );

  return {
    status: 'ready',
    createdCount: analysis.createdCount,
    copiedCount: 0,
    skippedCount: analysis.skippedCount,
    conflictCount: analysis.conflicts.length,
    conflicts: analysis.conflicts,
  };
};

export const applyWorkspaceMigrationSnapshot = (
  doc: Y.Doc,
  userId: string,
  snapshot: WorkspaceMigrationSnapshot,
): WorkspaceMigrationResult => {
  const records = buildMigrationEntityRecords(
    userId,
    normalizeWorkspaceMigrationSnapshot(snapshot),
  );
  const plan = buildMigrationWritePlan(
    userId,
    records,
    buildMigrationEntityRecords(userId, exportWorkspaceYDocToSnapshot(doc)),
  );
  if (plan.entities.length > 0) {
    mergeWorkspaceSnapshotIntoYDoc(
      doc,
      storedEntitiesToWorkspaceSnapshot(
        plan.entities.map((entity) => ({
          entityType: entity.entityType,
          entityId: entity.entityId,
          payloadJson: JSON.stringify(entity.payload),
          updatedAt: entity.sourceUpdatedAt,
        })),
      ),
    );
  }
  return {
    status: records.length === 0 ? 'no_data' : 'completed',
    createdCount: plan.createdCount,
    copiedCount: plan.copiedCount,
    skippedCount: plan.skippedCount,
    conflictCount: 0,
    conflicts: [],
  };
};

export const commitWorkspaceMigration = async (
  env: ApiEnv['Bindings'],
  userId: string,
  payload: WorkspaceMigrationPayload,
): Promise<WorkspaceMigrationResult> => {
  const records = buildMigrationEntityRecords(
    userId,
    normalizeWorkspaceMigrationSnapshot(payload.snapshot),
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

  const authority = await openDefaultWorkspaceYDocAuthority(env, userId);
  const result = await authority.migrateSnapshot(payload.snapshot);
  await recordCompletedWorkspaceMigration(env, {
    userId,
    localFingerprint: payload.localFingerprint,
    idempotencyKey: payload.idempotencyKey,
  });
  return result;
};
