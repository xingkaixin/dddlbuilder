import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { WorkspaceMigrationPayload } from '@ddlbuilder/shared-types/workspace';
import {
  analyzeWorkspaceMigration,
  commitWorkspaceMigration,
} from '../../lib/workspaceMigration.js';

const workspaceEntityMocks = vi.hoisted(() => ({
  getWorkspaceSnapshotFromEntities: vi.fn(),
  upsertDefaultWorkspaceEntities: vi.fn(),
}));

vi.mock('../../lib/workspaceEntities.js', () => ({
  getWorkspaceSnapshotFromEntities: workspaceEntityMocks.getWorkspaceSnapshotFromEntities,
  upsertDefaultWorkspaceEntities: workspaceEntityMocks.upsertDefaultWorkspaceEntities,
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
  beforeEach(() => {
    vi.clearAllMocks();
    workspaceEntityMocks.getWorkspaceSnapshotFromEntities.mockResolvedValue({
      globalDraft: null,
      drafts: [],
      savedTables: [],
      savedDrafts: [],
      folders: [],
    });
  });

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
    expect(queries).toHaveLength(1);
  });

  it('提交迁移时一次读取现有快照，并在内存中解决所有名称冲突', async () => {
    const queries: string[] = [];
    workspaceEntityMocks.getWorkspaceSnapshotFromEntities.mockResolvedValue({
      globalDraft: null,
      drafts: [],
      savedTables: ['alpha', 'beta', 'gamma'].map((name) => ({
        normalizedName: name,
        name,
        state: createState(`different_${name}`),
        createdAt: 1,
        updatedAt: 2,
      })),
      savedDrafts: [],
      folders: [],
    });
    const database = {
      prepare: (sql: string) => {
        queries.push(sql);
        const statement = {
          bind: () => statement,
          first: async () => null,
          all: async () => ({ results: [] }),
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
    expect(queries.some((sql) => sql.includes('workspace_snapshots'))).toBe(false);
    expect(workspaceEntityMocks.upsertDefaultWorkspaceEntities).toHaveBeenCalledOnce();
    expect(workspaceEntityMocks.upsertDefaultWorkspaceEntities).toHaveBeenCalledWith(
      expect.anything(),
      {
        userId: 'user-1',
        entities: expect.arrayContaining([
          expect.objectContaining({
            entityType: 'saved_table',
            entityId: 'alpha (imported)',
            payload: expect.objectContaining({ name: 'alpha (Imported)' }),
          }),
        ]),
      },
    );
  });

  it('重复迁移时复用已有导入副本', async () => {
    const payload = createPayload();
    payload.snapshot.savedTables = payload.snapshot.savedTables.slice(0, 1);
    workspaceEntityMocks.getWorkspaceSnapshotFromEntities.mockResolvedValue({
      globalDraft: null,
      drafts: [],
      savedTables: [
        {
          normalizedName: 'alpha',
          name: 'alpha',
          state: createState('different_alpha'),
          createdAt: 1,
          updatedAt: 2,
        },
        {
          normalizedName: 'alpha (imported)',
          name: 'alpha (Imported)',
          state: createState('alpha'),
          createdAt: 1,
          updatedAt: 2,
        },
      ],
      savedDrafts: [],
      folders: [],
    });
    const database = {
      prepare: () => {
        const statement = {
          bind: () => statement,
          first: async () => null,
          run: async () => ({ success: true }),
        };
        return statement;
      },
    };

    const result = await commitWorkspaceMigration(
      { USER_DB: database } as never,
      'user-1',
      payload,
    );

    expect(result).toEqual(
      expect.objectContaining({
        copiedCount: 0,
        skippedCount: 1,
      }),
    );
    expect(workspaceEntityMocks.upsertDefaultWorkspaceEntities).not.toHaveBeenCalled();
  });

  it('内容相同的已有记录只计为跳过且不触发实体写入', async () => {
    const payload = createPayload();
    workspaceEntityMocks.getWorkspaceSnapshotFromEntities.mockResolvedValue(payload.snapshot);
    const database = {
      prepare: () => {
        const statement = {
          bind: () => statement,
          first: async () => null,
          run: async () => ({ success: true }),
        };
        return statement;
      },
    };

    const result = await commitWorkspaceMigration(
      { USER_DB: database } as never,
      'user-1',
      payload,
    );

    expect(result).toEqual(
      expect.objectContaining({ createdCount: 0, copiedCount: 0, skippedCount: 3 }),
    );
    expect(workspaceEntityMocks.upsertDefaultWorkspaceEntities).not.toHaveBeenCalled();
  });
});
