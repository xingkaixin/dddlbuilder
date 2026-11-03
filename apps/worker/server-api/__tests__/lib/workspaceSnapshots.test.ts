import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from '../../lib/context.js';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { WorkspaceSnapshot } from '@ddlbuilder/shared-types/workspace';
import { createSqliteD1Database } from '../helpers/sqliteD1.js';

type StoredWorkspace = {
  id: string;
  userId: string;
  name: string;
  isDefault: number;
  activeAt: number | null;
  updatedAt: number;
};

type StoredLegacySnapshotRow = {
  userId: string;
  kind: string;
  normalizedName: string | null;
  payloadJson: string;
  sourceUpdatedAt: number;
};

// SAFETY: The snapshot test fixture reads only the required bindings from this environment.
const createEnv = (userDb: D1Database): ApiEnv['Bindings'] => ({
  ASSETS: { fetch: globalThis.fetch },
  SHARE_KV: {} as KVNamespace,
  USER_DB: userDb,
  BETTER_AUTH_SECRET: 'better-auth-secret',
  BETTER_AUTH_URL: 'http://localhost:3000',
  RESEND_API_KEY: 're_test_key',
  RESEND_FROM_EMAIL: 'noreply@example.com',
  RESEND_FROM_NAME: 'DDLBuilder',
  SIGNUP_BONUS_CREDITS: '100000',
});

const createWorkspaceSnapshotDb = (
  legacyRows: StoredLegacySnapshotRow[] = [],
  options: { initialWorkspaces?: StoredWorkspace[] } = {},
) => {
  const { database, sqlite } = createSqliteD1Database();
  sqlite
    .prepare(
      `
        INSERT INTO user (id, name, email, email_verified, created_at, updated_at)
        VALUES (?, ?, ?, 1, ?, ?)
      `,
    )
    .run('user-1', 'Test User', 'user-1@example.com', 1, 1);

  const insertLegacySnapshot = sqlite.prepare(`
    INSERT INTO workspace_snapshots (
      id, user_id, kind, normalized_name, payload_json, source_updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);
  legacyRows.forEach((row, index) => {
    insertLegacySnapshot.run(
      `legacy-${index}`,
      row.userId,
      row.kind,
      row.normalizedName,
      row.payloadJson,
      row.sourceUpdatedAt,
    );
  });

  const insertWorkspace = sqlite.prepare(`
    INSERT INTO workspaces (
      id, user_id, name, is_default, active_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const workspace of options.initialWorkspaces ?? []) {
    insertWorkspace.run(
      workspace.id,
      workspace.userId,
      workspace.name,
      workspace.isDefault,
      workspace.activeAt,
      workspace.updatedAt,
      workspace.updatedAt,
    );
  }

  return database;
};

const createState = (tableName: string): PersistedState => ({
  schemaName: '',
  tableName,
  tableComment: '',
  dbType: 'mysql',
  sqlFormatMode: 'compact',
  rows: [],
  addCount: 10,
  indexes: [],
  authInput: '',
  authObjects: [],
});

const createSnapshot = (tableNames: string[]): WorkspaceSnapshot => ({
  globalDraft: null,
  drafts: [],
  savedTables: tableNames.map((tableName, index) => ({
    normalizedName: tableName,
    name: tableName,
    state: createState(tableName),
    updatedAt: 100 + index,
  })),
  savedDrafts: [],
  folders: [],
});

const createLegacySavedTableRow = (
  userId: string,
  tableName: string,
  sourceUpdatedAt: number,
): StoredLegacySnapshotRow => ({
  userId,
  kind: 'saved_table',
  normalizedName: tableName,
  payloadJson: JSON.stringify({
    name: tableName,
    state: createState(tableName),
  }),
  sourceUpdatedAt,
});

const checkpointDefaultWorkspace = async (env: ApiEnv['Bindings'], snapshot: WorkspaceSnapshot) => {
  const { checkpointWorkspaceSnapshotEntities, getOrCreateDefaultWorkspace } =
    await import('../../lib/workspaceEntities.js');
  const workspace = await getOrCreateDefaultWorkspace(env, 'user-1');
  await checkpointWorkspaceSnapshotEntities(env, 'user-1', workspace.id, snapshot);

  return workspace.id;
};

describe('workspace entity checkpoints', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('读取快照时应从旧快照补齐缺失实体', async () => {
    const { getWorkspaceSnapshotForWorkspace } = await import('../../lib/workspaceEntities.js');

    const env = createEnv(
      createWorkspaceSnapshotDb([
        createLegacySavedTableRow('user-1', 'legacy', 100),
        createLegacySavedTableRow('user-1', 'users', 101),
      ]),
    );

    const workspaceId = await checkpointDefaultWorkspace(env, createSnapshot(['orders']));

    const prepareSpy = vi.spyOn(env.USER_DB, 'prepare');
    const snapshot = await getWorkspaceSnapshotForWorkspace(env, 'user-1', workspaceId);
    const persistedSnapshot = await getWorkspaceSnapshotForWorkspace(env, 'user-1', workspaceId);

    expect(snapshot.savedTables.map((item) => item.normalizedName).sort()).toEqual([
      'legacy',
      'orders',
      'users',
    ]);
    expect(persistedSnapshot.savedTables.map((item) => item.normalizedName).sort()).toEqual([
      'legacy',
      'orders',
      'users',
    ]);
    expect(
      prepareSpy.mock.calls.filter(([sql]) => String(sql).includes('FROM workspace_snapshots')),
    ).toHaveLength(1);
  });

  it('不应把默认 workspace 的旧快照回填到其他 workspace', async () => {
    const { getWorkspaceSnapshotForWorkspace } = await import('../../lib/workspaceEntities.js');

    const secondaryWorkspace: StoredWorkspace = {
      id: 'workspace-secondary',
      userId: 'user-1',
      name: 'Secondary',
      isDefault: 0,
      activeAt: 100,
      updatedAt: 100,
    };
    const env = createEnv(
      createWorkspaceSnapshotDb([createLegacySavedTableRow('user-1', 'legacy', 100)], {
        initialWorkspaces: [secondaryWorkspace],
      }),
    );

    const snapshot = await getWorkspaceSnapshotForWorkspace(env, 'user-1', secondaryWorkspace.id);

    expect(snapshot.savedTables).toEqual([]);
  });

  it('checkpoint 应把 workspace_entities 收敛到当前 Y.Doc snapshot', async () => {
    const { checkpointWorkspaceSnapshotEntities, getWorkspaceSnapshotForWorkspace } =
      await import('../../lib/workspaceEntities.js');
    const env = createEnv(createWorkspaceSnapshotDb());

    const workspaceId = await checkpointDefaultWorkspace(env, createSnapshot(['legacy', 'users']));

    const result = await checkpointWorkspaceSnapshotEntities(
      env,
      'user-1',
      workspaceId,
      createSnapshot(['orders']),
    );
    const snapshot = await getWorkspaceSnapshotForWorkspace(env, 'user-1', workspaceId);

    expect(result.upserted).toBe(1);
    expect(result.deleted).toBe(2);
    expect(snapshot.savedTables.map((item) => item.normalizedName)).toEqual(['orders']);
  });

  it('旧快照回填完成前保留 tombstone，完成后直接删除实体', async () => {
    const { checkpointWorkspaceSnapshotEntities } = await import('../../lib/workspaceEntities.js');
    const env = createEnv(createWorkspaceSnapshotDb());

    const countEntities = () =>
      env.USER_DB.prepare(
        'SELECT COUNT(*) AS total, COUNT(deleted_at) AS tombstones FROM workspace_entities',
      ).first<{ total: number; tombstones: number }>();
    const workspaceId = await checkpointDefaultWorkspace(env, createSnapshot(['orders', 'users']));

    await checkpointWorkspaceSnapshotEntities(
      env,
      'user-1',
      workspaceId,
      createSnapshot(['orders']),
    );

    expect(await countEntities()).toEqual({ total: 2, tombstones: 1 });

    await env.USER_DB.prepare(
      'UPDATE workspaces SET legacy_snapshot_backfilled_at = 1 WHERE id = ?',
    )
      .bind(workspaceId)
      .run();
    await checkpointWorkspaceSnapshotEntities(env, 'user-1', workspaceId, createSnapshot([]));

    expect(await countEntities()).toEqual({ total: 1, tombstones: 1 });
  });
});
