import { describe, expect, it } from 'vitest';
import type { ApiEnv } from '../../lib/context.js';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { WorkspaceSnapshot } from '@ddlbuilder/shared-types/workspace';

type StoredRow = {
  userId: string;
  kind: string;
  normalizedName: string | null;
  payloadJson: string;
  sourceUpdatedAt: number;
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
  const rows: StoredRow[] = [];

  return {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async all() {
              const [userId] = args;
              return {
                results: rows
                  .filter((row) => row.userId === userId)
                  .map((row) => ({
                    kind: row.kind,
                    normalizedName: row.normalizedName,
                    payloadJson: row.payloadJson,
                    sourceUpdatedAt: row.sourceUpdatedAt,
                  })),
              };
            },
            async first() {
              const [userId, kind, normalizedName] = args;
              const row = rows.find(
                (item) =>
                  item.userId === userId &&
                  item.kind === kind &&
                  item.normalizedName === normalizedName,
              );
              return row ? { sourceUpdatedAt: row.sourceUpdatedAt } : null;
            },
            async run() {
              if (sql.includes('DELETE FROM workspace_snapshots')) {
                const [userId] = args;
                for (let index = rows.length - 1; index >= 0; index -= 1) {
                  if (rows[index]?.userId === userId) {
                    rows.splice(index, 1);
                  }
                }
                return { success: true };
              }

              const [, userId, kind, normalizedName, payloadJson, sourceUpdatedAt] = args;
              const index = rows.findIndex(
                (item) =>
                  item.userId === userId &&
                  item.kind === kind &&
                  item.normalizedName === normalizedName,
              );
              const nextRow = {
                userId: String(userId),
                kind: String(kind),
                normalizedName: normalizedName === null ? null : String(normalizedName),
                payloadJson: String(payloadJson),
                sourceUpdatedAt: Number(sourceUpdatedAt),
              };

              if (index >= 0) {
                rows[index] = nextRow;
              } else {
                rows.push(nextRow);
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
