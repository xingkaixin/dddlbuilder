import { describe, expect, it, vi } from 'vitest';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { WorkspaceMigrationPayload } from '@ddlbuilder/shared-types/workspace';
import {
  analyzeWorkspaceMigration,
  commitWorkspaceMigration,
} from '../../lib/workspaceMigration.js';

const workspaceEntityMocks = vi.hoisted(() => ({
  upsertWorkspaceSnapshotEntity: vi.fn(),
}));

vi.mock('../../lib/workspaceEntities.js', () => ({
  upsertWorkspaceSnapshotEntity: workspaceEntityMocks.upsertWorkspaceSnapshotEntity,
}));

const createState = (tableName: string): PersistedState => ({
  schemaName: '',
  tableName,
  tableComment: '',
  dbType: 'mysql',
  sqlFormatMode: 'compact',
  rows: [],
  addCount: 1,
  indexInput: '',
  currentIndexFields: [],
  indexes: [],
  authInput: '',
  authObjects: [],
});

const createPayload = (): WorkspaceMigrationPayload => ({
  localFingerprint: 'local-1',
  idempotencyKey: 'migration-1',
  snapshot: {
    globalDraft: null,
    activeSession: null,
    drafts: [],
    savedTables: ['alpha', 'beta', 'gamma'].map((name) => ({
      normalizedName: name,
      name,
      state: createState(name),
      createdAt: 1,
      updatedAt: 2,
    })),
    savedDrafts: [],
    folders: [],
  },
});

describe('workspaceMigration', () => {
  it('分析迁移时识别所有待创建记录', async () => {
    const queries: string[] = [];
    const database = {
      prepare: (sql: string) => {
        queries.push(sql);
        const statement = {
          bind: () => statement,
          first: async () => null,
          all: async () => ({ results: [] }),
        };
        return statement;
      },
    };

    const result = await analyzeWorkspaceMigration(
      { USER_DB: database } as never,
      'user-1',
      createPayload(),
    );

    expect(result.createdCount).toBe(3);
    expect(queries).toHaveLength(2);
  });

  it('提交迁移时一次读取现有快照，并在内存中解决所有名称冲突', async () => {
    const queries: string[] = [];
    const existingRows = ['alpha', 'beta', 'gamma'].map((name) => ({
      id: `saved_table:user-1:${name}`,
      payloadJson: JSON.stringify({ different: name }),
    }));
    const database = {
      prepare: (sql: string) => {
        queries.push(sql);
        const statement = {
          bind: () => statement,
          first: async () => null,
          all: async () => ({ results: existingRows }),
          run: async () => ({ success: true }),
        };
        return statement;
      },
    };

    const result = await commitWorkspaceMigration(
      { USER_DB: database } as never,
      'user-1',
      createPayload(),
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: 'completed',
        createdCount: 0,
        copiedCount: 3,
        skippedCount: 0,
      }),
    );
    expect(queries.filter((sql) => sql.includes('FROM workspace_snapshots'))).toHaveLength(1);
    expect(workspaceEntityMocks.upsertWorkspaceSnapshotEntity).toHaveBeenCalledTimes(3);
  });
});
