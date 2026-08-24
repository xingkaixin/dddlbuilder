import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from '../../lib/context.js';
import { type PersistedState, toSchemaDocumentState } from '@ddlbuilder/shared-types';
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

type WorkspaceD1Log = {
  event: string;
  operation: string;
  d1: {
    queries: number;
    rowsRead: number;
    rowsWritten: number;
    durationMs: number;
  };
  [key: string]: unknown;
};

const createEnv = (userDb: D1Database): ApiEnv['Bindings'] => ({
  ASSETS: { fetch: globalThis.fetch },
  SHARE_KV: {} as KVNamespace,
  USER_DB: userDb,
  BETTER_AUTH_SECRET: 'better-auth-secret',
  BETTER_AUTH_URL: 'http://localhost:3000',
  RESEND_API_KEY: 're_test_key',
  RESEND_FROM_EMAIL: 'noreply@example.com',
  RESEND_FROM_NAME: 'DDLBuilder',
  TURNSTILE_SECRET_KEY: 'turnstile-secret',
  SIGNUP_BONUS_CREDITS: '100000',
});

const createWorkspaceSnapshotDb = (
  legacyRows: StoredLegacySnapshotRow[] = [],
  options: { includeMeta?: boolean; initialWorkspaces?: StoredWorkspace[] } = {},
) => {
  const { database, sqlite } = createSqliteD1Database({ includeMeta: options.includeMeta });
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
  const insertClock = sqlite.prepare(
    'INSERT INTO workspace_clocks (workspace_id, next_version) VALUES (?, 0)',
  );
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
    insertClock.run(workspace.id);
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
  indexInput: '',
  currentIndexFields: [],
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

const readWorkspaceD1Log = (calls: unknown[][]) =>
  JSON.parse(String(calls[0]?.[0])) as WorkspaceD1Log;

describe('workspace entity checkpoints', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('上传快照时应保留云端已有实体', async () => {
    const {
      getWorkspaceSnapshotFromEntities: getWorkspaceSnapshot,
      putWorkspaceSnapshotAsEntities: putWorkspaceSnapshot,
    } = await import('../../lib/workspaceEntities.js');
    const env = createEnv(createWorkspaceSnapshotDb());

    await putWorkspaceSnapshot(env, 'user-1', createSnapshot(['legacy', 'users']));
    await putWorkspaceSnapshot(env, 'user-1', createSnapshot(['orders']));

    const snapshot = await getWorkspaceSnapshot(env, 'user-1');

    expect(snapshot.savedTables.map((item) => item.normalizedName).sort()).toEqual([
      'legacy',
      'orders',
      'users',
    ]);
  });

  it('读取快照时应从旧快照补齐缺失实体', async () => {
    const {
      getWorkspaceSnapshotFromEntities: getWorkspaceSnapshot,
      putWorkspaceSnapshotAsEntities: putWorkspaceSnapshot,
    } = await import('../../lib/workspaceEntities.js');
    const env = createEnv(
      createWorkspaceSnapshotDb([
        createLegacySavedTableRow('user-1', 'legacy', 100),
        createLegacySavedTableRow('user-1', 'users', 101),
      ]),
    );

    await putWorkspaceSnapshot(env, 'user-1', createSnapshot(['orders']));

    const prepareSpy = vi.spyOn(env.USER_DB, 'prepare');
    const snapshot = await getWorkspaceSnapshot(env, 'user-1');
    const persistedSnapshot = await getWorkspaceSnapshot(env, 'user-1');

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

  it('应同步多份普通草稿', async () => {
    const {
      getWorkspaceSnapshotFromEntities: getWorkspaceSnapshot,
      putWorkspaceSnapshotAsEntities: putWorkspaceSnapshot,
    } = await import('../../lib/workspaceEntities.js');
    const env = createEnv(createWorkspaceSnapshotDb());

    await putWorkspaceSnapshot(env, 'user-1', {
      globalDraft: null,
      drafts: [
        {
          draftId: 'draft-1',
          state: createState('draft_one'),
          createdAt: 50,
          updatedAt: 100,
          folderId: 'folder_1',
        },
        {
          draftId: 'draft-2',
          state: createState('draft_two'),
          createdAt: 40,
          updatedAt: 200,
        },
      ],
      savedTables: [],
      savedDrafts: [],
      folders: [],
    });

    const snapshot = await getWorkspaceSnapshot(env, 'user-1');

    expect(snapshot.drafts).toEqual([
      {
        draftId: 'draft-1',
        state: toSchemaDocumentState(createState('draft_one')),
        createdAt: 50,
        updatedAt: 100,
        folderId: 'folder_1',
      },
      {
        draftId: 'draft-2',
        state: toSchemaDocumentState(createState('draft_two')),
        createdAt: 40,
        updatedAt: 200,
      },
    ]);
  });

  it('checkpoint 应把 workspace_entities 收敛到当前 Y.Doc snapshot', async () => {
    const {
      checkpointWorkspaceSnapshotEntities,
      getWorkspaceSnapshotForWorkspace,
      putWorkspaceSnapshotAsEntities,
    } = await import('../../lib/workspaceEntities.js');
    const env = createEnv(createWorkspaceSnapshotDb());

    await putWorkspaceSnapshotAsEntities(env, 'user-1', createSnapshot(['legacy', 'users']));
    const workspace = await env.USER_DB.prepare(
      `
        SELECT id
        FROM workspaces
        WHERE user_id = ? AND is_default = 1
        LIMIT 1
      `,
    )
      .bind('user-1')
      .first<{ id: string }>();

    const result = await checkpointWorkspaceSnapshotEntities(
      env,
      'user-1',
      workspace?.id ?? '',
      createSnapshot(['orders']),
    );
    const snapshot = await getWorkspaceSnapshotForWorkspace(env, 'user-1', workspace?.id ?? '');

    expect(result.upserted).toBe(1);
    expect(result.deleted).toBe(2);
    expect(snapshot.savedTables.map((item) => item.normalizedName)).toEqual(['orders']);
  });

  it('checkpoint 日志应覆盖单次实体列表读取和批量写入', async () => {
    const { checkpointWorkspaceSnapshotEntities, putWorkspaceSnapshotAsEntities } =
      await import('../../lib/workspaceEntities.js');
    const env = createEnv(createWorkspaceSnapshotDb([], { includeMeta: true }));

    await putWorkspaceSnapshotAsEntities(env, 'user-1', createSnapshot([]));
    const workspace = await env.USER_DB.prepare(
      `
        SELECT id
        FROM workspaces
        WHERE user_id = ? AND is_default = 1
        LIMIT 1
      `,
    )
      .bind('user-1')
      .first<{ id: string }>();
    const workspaceId = workspace?.id ?? '';
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});

    await checkpointWorkspaceSnapshotEntities(
      env,
      'user-1',
      workspaceId,
      createSnapshot(['orders']),
    );

    expect(readWorkspaceD1Log(info.mock.calls)).toMatchObject({
      event: 'workspace_sync_d1',
      operation: 'checkpoint',
      workspaceId,
      entityCount: 1,
      upserted: 1,
      deleted: 0,
      skipped: 0,
      d1: {
        queries: 4,
        rowsRead: 1,
        rowsWritten: 2,
        durationMs: 4,
      },
    });
  });

  it('未变化实体数量增加时不应增加 checkpoint 查询次数', async () => {
    const { checkpointWorkspaceSnapshotEntities, putWorkspaceSnapshotAsEntities } =
      await import('../../lib/workspaceEntities.js');
    const env = createEnv(createWorkspaceSnapshotDb([], { includeMeta: true }));
    const snapshot = createSnapshot(['orders', 'users', 'products']);

    await putWorkspaceSnapshotAsEntities(env, 'user-1', snapshot);
    const workspace = await env.USER_DB.prepare(
      `
        SELECT id
        FROM workspaces
        WHERE user_id = ? AND is_default = 1
        LIMIT 1
      `,
    )
      .bind('user-1')
      .first<{ id: string }>();
    const workspaceId = workspace?.id ?? '';
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});

    const result = await checkpointWorkspaceSnapshotEntities(env, 'user-1', workspaceId, snapshot);

    expect(result).toMatchObject({ upserted: 0, deleted: 0, skipped: 3 });
    expect(readWorkspaceD1Log(info.mock.calls)).toMatchObject({
      event: 'workspace_sync_d1',
      operation: 'checkpoint',
      workspaceId,
      entityCount: 3,
      d1: {
        queries: 3,
        rowsRead: 5,
        rowsWritten: 0,
        durationMs: 3,
      },
    });
  });
});
