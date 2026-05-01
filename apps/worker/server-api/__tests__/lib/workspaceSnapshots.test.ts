import { describe, expect, it } from 'vitest';
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

const createEnv = (userDb: D1Database): ApiEnv['Bindings'] => ({
  ASSETS: { fetch: globalThis.fetch },
  SHARE_KV: {} as KVNamespace,
  RATE_LIMIT_KV: {} as KVNamespace,
  USER_DB: userDb,
  BETTER_AUTH_SECRET: 'better-auth-secret',
  BETTER_AUTH_URL: 'http://localhost:3000',
  RESEND_API_KEY: 're_test_key',
  RESEND_FROM_EMAIL: 'noreply@example.com',
  RESEND_FROM_NAME: 'DDLBuilder',
  TURNSTILE_SECRET_KEY: 'turnstile-secret',
  SIGNUP_BONUS_CREDITS: '100000',
});

const createWorkspaceSnapshotDb = () => {
  const workspaces: StoredWorkspace[] = [];
  const clocks = new Map<string, number>();
  const rows: StoredRow[] = [];

  return {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async all() {
              if (sql.includes('FROM workspace_entities')) {
                const [workspaceId] = args;
                return {
                  results: rows
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
                };
              }

              return {
                results: [],
              };
            },
            async first() {
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

              if (sql.includes('UPDATE workspace_clocks')) {
                const [workspaceId] = args;
                const next = (clocks.get(String(workspaceId)) ?? 0) + 1;
                clocks.set(String(workspaceId), next);
                return { version: next };
              }

              return null;
            },
            async run() {
              if (sql.includes('INSERT INTO workspaces')) {
                const [id, userId, name, activeAt, , updatedAt] = args;
                workspaces.push({
                  id: String(id),
                  userId: String(userId),
                  name: String(name),
                  isDefault: 1,
                  activeAt: Number(activeAt),
                  updatedAt: Number(updatedAt),
                });
                return { success: true };
              }

              if (sql.includes('INSERT INTO workspace_clocks')) {
                const [workspaceId] = args;
                clocks.set(String(workspaceId), 0);
                return { success: true };
              }

              if (sql.includes('INSERT INTO workspace_entities')) {
                const [
                  ,
                  workspaceId,
                  userId,
                  entityType,
                  entityId,
                  payloadJson,
                  contentHash,
                  version,
                  deletedAt,
                  ,
                  updatedAt,
                ] = args;
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
                return { success: true };
              }

              return { success: true };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
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

describe('workspaceSnapshots', () => {
  it('上传快照时应替换用户云端工作区', async () => {
    const { getWorkspaceSnapshot, putWorkspaceSnapshot } =
      await import('../../lib/workspaceSnapshots.js');
    const env = createEnv(createWorkspaceSnapshotDb());

    await putWorkspaceSnapshot(env, 'user-1', createSnapshot(['legacy', 'users']));
    await putWorkspaceSnapshot(env, 'user-1', createSnapshot(['orders']));

    const snapshot = await getWorkspaceSnapshot(env, 'user-1');

    expect(snapshot.savedTables.map((item) => item.normalizedName)).toEqual(['orders']);
  });

  it('应同步多份普通草稿', async () => {
    const { getWorkspaceSnapshot, putWorkspaceSnapshot } =
      await import('../../lib/workspaceSnapshots.js');
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
});
