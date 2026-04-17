import type { PersistedState } from '@ddlbuilder/shared-types';
import type { WorkspaceSnapshot } from '@ddlbuilder/shared-types/workspace';
import type { ApiEnv } from './context.js';

type SnapshotKind = 'global_draft' | 'saved_table' | 'saved_draft' | 'folder';

type SnapshotRow = {
  kind: SnapshotKind;
  normalizedName: string | null;
  payloadJson: string;
  sourceUpdatedAt: number;
};

type SavedTablePayload = {
  name: string;
  state: PersistedState;
  folderId?: string;
};

type SavedDraftPayload = {
  tableName: string;
  state: PersistedState;
  baseSignature: string;
};

type FolderPayload = {
  id: string;
  name: string;
  parentId?: string;
  order: number;
  createdAt: number;
};

const buildSnapshotId = (userId: string, kind: SnapshotKind, normalizedName: string | null, folderId?: string) =>
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

  const result = await env.USER_DB.prepare(
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

  if (!result.success) {
    throw new Error(result.error ?? 'D1 execution failed');
  }
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
    folders: [],
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
        folderId: payload.folderId,
      });
      continue;
    }

    if (row.kind === 'folder') {
      const payload = JSON.parse(row.payloadJson) as FolderPayload;
      snapshot.folders.push({
        id: payload.id,
        name: payload.name,
        parentId: payload.parentId,
        order: payload.order,
        createdAt: payload.createdAt,
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
        folderId: item.folderId,
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

  for (const item of snapshot.folders) {
    await upsertSnapshot(env, {
      userId,
      kind: 'folder',
      normalizedName: item.id,
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
};
