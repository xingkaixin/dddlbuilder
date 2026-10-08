import type * as Y from 'yjs';
import {
  exportWorkspaceYDocToSnapshot,
  mergeWorkspaceSnapshotIntoYDoc,
  normalizeWorkspaceMigrationSnapshot,
} from '@ddlbuilder/workspace-core';
import type { WorkspaceMigrationResult } from '@ddlbuilder/shared-types/api';
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

const isWorkspaceMigrated = async (
  env: ApiEnv['Bindings'],
  userId: string,
  localFingerprint: string,
) => {
  const row = await env.USER_DB.prepare(
    `
      SELECT 1 AS migrated
      FROM workspace_links
      WHERE user_id = ? AND local_fingerprint = ?
      LIMIT 1
    `,
  )
    .bind(userId, localFingerprint)
    .first();

  return row !== null;
};

const recordCompletedWorkspaceMigration = async (
  env: ApiEnv['Bindings'],
  input: {
    userId: string;
    localFingerprint: string;
  },
) => {
  const now = Date.now();
  await env.USER_DB.prepare(
    `
      INSERT INTO workspace_links (
        id,
        user_id,
        local_fingerprint,
        migrated_at,
        created_at
      )
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id, local_fingerprint) DO UPDATE SET
        migrated_at = excluded.migrated_at
    `,
  )
    .bind(
      `workspace-link:${input.userId}:${input.localFingerprint}`,
      input.userId,
      input.localFingerprint,
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

  if (await isWorkspaceMigrated(env, userId, payload.localFingerprint)) {
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

  if (await isWorkspaceMigrated(env, userId, payload.localFingerprint)) {
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
  });

  return result;
};
