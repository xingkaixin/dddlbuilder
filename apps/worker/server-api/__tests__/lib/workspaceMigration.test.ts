import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { WorkspaceMigrationPayload } from '@ddlbuilder/shared-types/workspace';
import {
  analyzeWorkspaceMigration,
  commitWorkspaceMigration,
} from '../../lib/workspaceMigration.js';

const authorityMocks = vi.hoisted(() => ({
  readSnapshot: vi.fn(),
  mergeSnapshot: vi.fn(),
}));

vi.mock('../../lib/workspaceYDocAuthority.js', () => ({
  openDefaultWorkspaceYDocAuthority: vi.fn(async () => authorityMocks),
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
    authorityMocks.readSnapshot.mockResolvedValue({
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
    authorityMocks.readSnapshot.mockResolvedValue({
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
    expect(authorityMocks.mergeSnapshot).toHaveBeenCalledOnce();
    expect(authorityMocks.mergeSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        savedTables: expect.arrayContaining([
          expect.objectContaining({
            normalizedName: 'alpha (imported)',
            name: 'alpha (Imported)',
          }),
        ]),
      }),
    );
  });

  it('重复迁移时复用已有导入副本', async () => {
    const payload = createPayload();
    payload.snapshot.savedTables = payload.snapshot.savedTables.slice(0, 1);
    authorityMocks.readSnapshot.mockResolvedValue({
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
    expect(authorityMocks.mergeSnapshot).not.toHaveBeenCalled();
  });

  it('内容相同的已有记录只计为跳过且不触发实体写入', async () => {
    const payload = createPayload();
    authorityMocks.readSnapshot.mockResolvedValue(payload.snapshot);
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
    expect(authorityMocks.mergeSnapshot).not.toHaveBeenCalled();
  });

  it('冲突副本应保留表草稿和文件夹引用', async () => {
    const payload = createPayload();
    payload.snapshot.savedTables = [
      {
        ...payload.snapshot.savedTables[0],
        normalizedName: 'alpha',
        name: 'alpha',
        folderId: 'folder-a',
      },
    ];
    payload.snapshot.savedDrafts = [
      {
        normalizedName: 'alpha',
        tableName: 'alpha',
        state: createState('alpha draft'),
        baseSignature: 'base-alpha',
        updatedAt: 2,
      },
    ];
    payload.snapshot.folders = [
      {
        id: 'folder-a',
        name: 'Local',
        order: 0,
        createdAt: 1,
        updatedAt: 2,
      },
      {
        id: 'folder-child',
        name: 'Child',
        parentId: 'folder-a',
        order: 0,
        createdAt: 1,
        updatedAt: 2,
      },
    ];
    authorityMocks.readSnapshot.mockResolvedValue({
      globalDraft: null,
      drafts: [],
      savedTables: [
        {
          normalizedName: 'alpha',
          name: 'alpha',
          state: createState('cloud alpha'),
          createdAt: 1,
          updatedAt: 2,
        },
      ],
      savedDrafts: [],
      folders: [
        {
          id: 'folder-a',
          name: 'Cloud',
          order: 0,
          createdAt: 1,
          updatedAt: 2,
        },
      ],
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

    await commitWorkspaceMigration({ USER_DB: database } as never, 'user-1', payload);

    const snapshot = authorityMocks.mergeSnapshot.mock.calls[0]?.[0];
    const table = snapshot.savedTables[0];
    const draft = snapshot.savedDrafts[0];
    const folder = snapshot.folders.find(
      (item: { name: string }) => item.name === 'Local (Imported)',
    );
    const child = snapshot.folders.find((item: { name: string }) => item.name === 'Child');

    expect(draft.normalizedName).toBe(table.normalizedName);
    expect(table.folderId).toBe(folder.id);
    expect(child.parentId).toBe(folder.id);
  });
});
