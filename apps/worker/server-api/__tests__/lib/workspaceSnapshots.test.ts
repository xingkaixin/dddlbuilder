import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from '../../lib/context.js';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { WorkspaceSnapshot } from '@ddlbuilder/shared-types/workspace';

type StoredRow = {
  workspaceId: string;
  userId: string;
  entityType: string;
  entityId: string;
  payloadJson: string | null;
  contentHash: string | null;
  version: number;
  deletedAt: number | null;
  updatedAt: number;
};

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

type StoredMutation = {
  workspaceId: string;
  clientMutationId: string;
  entityType: string;
  entityId: string;
  version: number;
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
  options: { includeMeta?: boolean } = {},
) => {
  const workspaces: StoredWorkspace[] = [];
  const clocks = new Map<string, number>();
  const rows: StoredRow[] = [];
  const mutations: StoredMutation[] = [];

  const withMeta = <T extends Record<string, unknown>>(
    result: T,
    rowsRead: number,
    rowsWritten: number,
  ) =>
    options.includeMeta
      ? {
          ...result,
          meta: {
            rows_read: rowsRead,
            rows_written: rowsWritten,
            duration: 1,
          },
        }
      : result;
  const allResult = <T>(results: T[], rowsWritten = 0) =>
    withMeta({ results }, results.length, rowsWritten);
  const writeReturningResult = <T>(results: T[]) => withMeta({ results }, 0, 1);
  const runResult = () => withMeta({ success: true }, 0, 1);

  const database = {
    async batch(statements: D1PreparedStatement[]) {
      const results = [];
      for (const statement of statements) {
        results.push(await statement.run());
      }
      return results;
    },
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async all() {
              if (sql.includes('UPDATE workspace_clocks')) {
                const [workspaceId] = args;
                const next = (clocks.get(String(workspaceId)) ?? 0) + 1;
                clocks.set(String(workspaceId), next);
                return writeReturningResult([{ version: next }]);
              }

              if (sql.includes('SELECT next_version AS cursor')) {
                const [workspaceId] = args;
                return allResult([{ cursor: clocks.get(String(workspaceId)) ?? 0 }]);
              }

              if (sql.includes('WHERE id = ? AND user_id = ?')) {
                const [workspaceId, userId] = args;
                const workspace = workspaces.find(
                  (item) => item.id === workspaceId && item.userId === userId,
                );
                return allResult(workspace ? [{ id: workspace.id }] : []);
              }

              if (sql.includes('FROM workspace_mutations')) {
                const [workspaceId, clientMutationId] = args;
                const mutation = mutations.find(
                  (item) =>
                    item.workspaceId === workspaceId && item.clientMutationId === clientMutationId,
                );
                return allResult(
                  mutation
                    ? [
                        {
                          entityType: mutation.entityType,
                          entityId: mutation.entityId,
                          version: mutation.version,
                        },
                      ]
                    : [],
                );
              }

              if (
                sql.includes('FROM workspace_entities') &&
                sql.includes('entity_type = ?') &&
                sql.includes('entity_id = ?')
              ) {
                const [workspaceId, entityType, entityId] = args;
                const row = rows.find(
                  (item) =>
                    item.workspaceId === workspaceId &&
                    item.entityType === entityType &&
                    item.entityId === entityId,
                );
                return allResult(
                  row
                    ? [
                        {
                          entityType: row.entityType,
                          entityId: row.entityId,
                          payloadJson: row.payloadJson,
                          contentHash: row.contentHash,
                          version: row.version,
                          deletedAt: row.deletedAt,
                          updatedAt: row.updatedAt,
                        },
                      ]
                    : [],
                );
              }

              if (sql.includes('FROM workspace_entities')) {
                const [workspaceId] = args;
                if (!sql.includes('payload_json')) {
                  return allResult(
                    rows
                      .filter((row) => row.workspaceId === workspaceId)
                      .map((row) => ({
                        entityType: row.entityType,
                        entityId: row.entityId,
                      })),
                  );
                }
                if (sql.includes('version >')) {
                  const [, since] = args;
                  return allResult(
                    rows
                      .filter(
                        (row) => row.workspaceId === workspaceId && row.version > Number(since),
                      )
                      .sort((a, b) => a.version - b.version)
                      .map((row) => ({
                        entityType: row.entityType,
                        entityId: row.entityId,
                        payloadJson: row.payloadJson,
                        contentHash: row.contentHash,
                        version: row.version,
                        deletedAt: row.deletedAt,
                        updatedAt: row.updatedAt,
                      })),
                  );
                }
                return allResult(
                  rows
                    .filter((row) => row.workspaceId === workspaceId && row.deletedAt === null)
                    .sort((a, b) => a.version - b.version)
                    .map((row) => ({
                      entityType: row.entityType,
                      entityId: row.entityId,
                      payloadJson: row.payloadJson,
                      contentHash: row.contentHash,
                      version: row.version,
                      deletedAt: row.deletedAt,
                      updatedAt: row.updatedAt,
                    })),
                );
              }

              if (sql.includes('FROM workspace_snapshots')) {
                const [userId] = args;
                return allResult(
                  legacyRows
                    .filter((row) => row.userId === userId)
                    .map((row) => ({
                      kind: row.kind,
                      normalizedName: row.normalizedName,
                      payloadJson: row.payloadJson,
                      sourceUpdatedAt: row.sourceUpdatedAt,
                    })),
                );
              }

              return allResult([]);
            },
            async first() {
              if (
                sql.includes('FROM workspace_entities') &&
                sql.includes('entity_type = ?') &&
                sql.includes('entity_id = ?')
              ) {
                const [workspaceId, entityType, entityId] = args;
                const row = rows.find(
                  (item) =>
                    item.workspaceId === workspaceId &&
                    item.entityType === entityType &&
                    item.entityId === entityId,
                );
                return row
                  ? {
                      entityType: row.entityType,
                      entityId: row.entityId,
                      payloadJson: row.payloadJson,
                      contentHash: row.contentHash,
                      version: row.version,
                      deletedAt: row.deletedAt,
                      updatedAt: row.updatedAt,
                    }
                  : null;
              }

              if (sql.includes('WHERE id = ? AND user_id = ?')) {
                const [workspaceId, userId] = args;
                const workspace = workspaces.find(
                  (item) => item.id === workspaceId && item.userId === userId,
                );
                return workspace ? { id: workspace.id } : null;
              }

              if (sql.includes('FROM workspaces')) {
                const [userId] = args;
                const workspace = workspaces.find(
                  (item) => item.userId === userId && item.isDefault === 1,
                );
                return workspace
                  ? {
                      id: workspace.id,
                      name: workspace.name,
                      isDefault: workspace.isDefault,
                      activeAt: workspace.activeAt,
                      updatedAt: workspace.updatedAt,
                    }
                  : null;
              }

              if (sql.includes('SELECT next_version AS cursor')) {
                const [workspaceId] = args;
                return { cursor: clocks.get(String(workspaceId)) ?? 0 };
              }

              if (sql.includes('UPDATE workspace_clocks')) {
                const [workspaceId] = args;
                const next = (clocks.get(String(workspaceId)) ?? 0) + 1;
                clocks.set(String(workspaceId), next);
                return { version: next };
              }

              return null;
            },
            async run() {
              if (sql.includes('UPDATE workspace_clocks')) {
                const [workspaceId, mutationId] = args;
                const shouldIncrement =
                  mutationId === undefined ||
                  mutations.some(
                    (item) =>
                      `${item.workspaceId}:${item.clientMutationId}` === mutationId &&
                      item.version === 0,
                  );
                if (shouldIncrement) {
                  clocks.set(String(workspaceId), (clocks.get(String(workspaceId)) ?? 0) + 1);
                }
                return runResult();
              }

              if (sql.includes('INSERT INTO workspaces')) {
                const [id, userId, name, activeAt, , updatedAt] = args;
                if (!workspaces.some((item) => item.userId === userId && item.isDefault === 1)) {
                  workspaces.push({
                    id: String(id),
                    userId: String(userId),
                    name: String(name),
                    isDefault: 1,
                    activeAt: Number(activeAt),
                    updatedAt: Number(updatedAt),
                  });
                }
                return runResult();
              }

              if (sql.includes('INSERT INTO workspace_clocks')) {
                const [userId] = args;
                const workspace = workspaces.find(
                  (item) => item.userId === userId && item.isDefault === 1,
                );
                if (workspace && !clocks.has(workspace.id)) {
                  clocks.set(workspace.id, 0);
                }
                return runResult();
              }

              if (sql.includes('INSERT INTO workspace_entities')) {
                const [, workspaceId, userId, entityType, entityId, payloadJson, contentHash] =
                  args;
                const usesClockVersion = sql.includes('workspace_clocks.next_version');
                const version = usesClockVersion
                  ? clocks.get(String(workspaceId))
                  : clocks.get(String(args[10]));
                const deletedAt = args[7];
                const updatedAt = args[9];
                const mutationId = usesClockVersion ? args[11] : undefined;
                if (
                  mutationId !== undefined &&
                  !mutations.some(
                    (item) =>
                      `${item.workspaceId}:${item.clientMutationId}` === mutationId &&
                      item.version === 0,
                  )
                ) {
                  return runResult();
                }
                const index = rows.findIndex(
                  (item) =>
                    item.workspaceId === workspaceId &&
                    item.entityType === entityType &&
                    item.entityId === entityId,
                );
                const nextRow = {
                  workspaceId: String(workspaceId),
                  userId: String(userId),
                  entityType: String(entityType),
                  entityId: String(entityId),
                  payloadJson: payloadJson == null ? null : String(payloadJson),
                  contentHash: contentHash == null ? null : String(contentHash),
                  version: Number(version),
                  deletedAt: deletedAt == null ? null : Number(deletedAt),
                  updatedAt: Number(updatedAt),
                };

                if (index >= 0) {
                  rows[index] = nextRow;
                } else {
                  rows.push(nextRow);
                }
                return withMeta({ success: true, results: [{ version }] }, 0, 1);
              }

              if (sql.includes('INSERT INTO workspace_mutations')) {
                const [, workspaceId, , clientMutationId, entityType, entityId] = args;
                const index = mutations.findIndex(
                  (item) =>
                    item.workspaceId === workspaceId && item.clientMutationId === clientMutationId,
                );
                if (index < 0) {
                  const baseVersion = sql.includes('SELECT') ? args[16] : undefined;
                  const existing = rows.find(
                    (item) =>
                      item.workspaceId === workspaceId &&
                      item.entityType === entityType &&
                      item.entityId === entityId,
                  );
                  if (existing && existing.version !== baseVersion) {
                    return runResult();
                  }
                  mutations.push({
                    workspaceId: String(workspaceId),
                    clientMutationId: String(clientMutationId),
                    entityType: String(entityType),
                    entityId: String(entityId),
                    version: sql.includes('SELECT') ? 0 : Number(args[6]),
                  });
                }
                return runResult();
              }

              if (sql.includes('UPDATE workspace_mutations')) {
                const [workspaceId, mutationId] = args;
                const mutation = mutations.find(
                  (item) =>
                    `${item.workspaceId}:${item.clientMutationId}` === mutationId &&
                    item.version === 0,
                );
                if (mutation) {
                  mutation.version = clocks.get(String(workspaceId)) ?? 0;
                }
                return runResult();
              }

              return runResult();
            },
          };
        },
      };
    },
  };
  return database as unknown as D1Database;
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

  it('checkpoint 日志应覆盖实体读取、写入、active 列表和 cursor 查询', async () => {
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
        queries: 6,
        rowsRead: 3,
        rowsWritten: 2,
        durationMs: 6,
      },
    });
  });
});
