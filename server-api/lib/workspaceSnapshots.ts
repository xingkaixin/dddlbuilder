import type { PersistedState } from '../../src/types/index.js';
import type { WorkspaceSnapshot } from '../../src/types/workspace.js';
import type { ApiEnv } from './context.js';

type SnapshotKind = 'global_draft' | 'saved_table' | 'saved_draft';

type SnapshotRow = {
  kind: SnapshotKind;
  normalizedName: string | null;
  payloadJson: string;
  sourceUpdatedAt: number;
};

type SavedTablePayload = {
  name: string;
  state: PersistedState;
};

type SavedDraftPayload = {
  tableName: string;
  state: PersistedState;
  baseSignature: string;
};

const buildSnapshotId = (userId: string, kind: SnapshotKind, normalizedName: string | null) =>
  `${kind}:${userId}:${normalizedName ?? 'global'}`;

const listSnapshotRows = async (
  env: ApiEnv['Bindings'],
  userId: string,
): Promise<SnapshotRow[]> => {
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
    .all<SnapshotRow>();

  return result.results ?? [];
};

const readExistingUpdatedAt = async (
  env: ApiEnv['Bindings'],
  userId: string,
  kind: SnapshotKind,
  normalizedName: string | null,
) => {
  const row = await env.USER_DB.prepare(
    `
      SELECT source_updated_at AS sourceUpdatedAt
      FROM workspace_snapshots
      WHERE user_id = ? AND kind = ? AND normalized_name IS ?
      LIMIT 1
    `,
  )
    .bind(userId, kind, normalizedName)
    .first<{ sourceUpdatedAt: number }>();

  return row?.sourceUpdatedAt ?? null;
};

const upsertSnapshot = async (
  env: ApiEnv['Bindings'],
  input: {
    userId: string;
    kind: SnapshotKind;
    normalizedName: string | null;
    payload: Record<string, unknown>;
    sourceUpdatedAt: number;
  },
) => {
  const existingUpdatedAt = await readExistingUpdatedAt(
    env,
    input.userId,
    input.kind,
    input.normalizedName,
  );
  if (existingUpdatedAt != null && existingUpdatedAt > input.sourceUpdatedAt) {
    return;
  }

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
      buildSnapshotId(input.userId, input.kind, input.normalizedName),
      input.userId,
      input.kind,
      input.normalizedName,
      JSON.stringify(input.payload),
      input.sourceUpdatedAt,
    )
    .run();
};

export const getWorkspaceSnapshot = async (
  env: ApiEnv['Bindings'],
  userId: string,
): Promise<WorkspaceSnapshot> => {
  const rows = await listSnapshotRows(env, userId);

  const snapshot: WorkspaceSnapshot = {
    globalDraft: null,
    savedTables: [],
    savedDrafts: [],
  };

  for (const row of rows) {
    if (row.kind === 'global_draft') {
      const payload = JSON.parse(row.payloadJson) as { state?: PersistedState };
      if (payload.state) {
        snapshot.globalDraft = {
          state: payload.state,
          updatedAt: row.sourceUpdatedAt,
        };
      }
      continue;
    }

    if (!row.normalizedName) {
      continue;
    }

    if (row.kind === 'saved_table') {
      const payload = JSON.parse(row.payloadJson) as SavedTablePayload;
      snapshot.savedTables.push({
        normalizedName: row.normalizedName,
        name: payload.name,
        state: payload.state,
        updatedAt: row.sourceUpdatedAt,
      });
      continue;
    }

    const payload = JSON.parse(row.payloadJson) as SavedDraftPayload;
    snapshot.savedDrafts.push({
      normalizedName: row.normalizedName,
      tableName: payload.tableName,
      state: payload.state,
      updatedAt: row.sourceUpdatedAt,
      baseSignature: payload.baseSignature,
    });
  }

  snapshot.savedTables.sort((a, b) => b.updatedAt - a.updatedAt);
  snapshot.savedDrafts.sort((a, b) => b.updatedAt - a.updatedAt);

  return snapshot;
};

export const putWorkspaceSnapshot = async (
  env: ApiEnv['Bindings'],
  userId: string,
  snapshot: WorkspaceSnapshot,
) => {
  if (snapshot.globalDraft) {
    await upsertSnapshot(env, {
      userId,
      kind: 'global_draft',
      normalizedName: null,
      payload: {
        state: snapshot.globalDraft.state,
      },
      sourceUpdatedAt: snapshot.globalDraft.updatedAt,
    });
  }

  for (const item of snapshot.savedTables) {
    await upsertSnapshot(env, {
      userId,
      kind: 'saved_table',
      normalizedName: item.normalizedName,
      payload: {
        name: item.name,
        state: item.state,
      },
      sourceUpdatedAt: item.updatedAt,
    });
  }

  for (const item of snapshot.savedDrafts) {
    await upsertSnapshot(env, {
      userId,
      kind: 'saved_draft',
      normalizedName: item.normalizedName,
      payload: {
        tableName: item.tableName,
        state: item.state,
        baseSignature: item.baseSignature,
      },
      sourceUpdatedAt: item.updatedAt,
    });
  }
};
