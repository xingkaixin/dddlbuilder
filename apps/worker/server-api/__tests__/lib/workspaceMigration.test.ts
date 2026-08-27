import * as Y from 'yjs';
import {
  decodeWorkspaceMigrationPayload,
  importWorkspaceSnapshotToYDoc,
  exportWorkspaceYDocToSnapshot,
  mergeWorkspaceSnapshotIntoYDoc,
} from '@ddlbuilder/workspace-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toSchemaDocumentState, type SchemaDocumentState } from '@ddlbuilder/shared-types';
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

const createState = (tableName: string): SchemaDocumentState =>
  toSchemaDocumentState({
    objectType: 'table',
    viewDefinition: '',
    viewCreateOrReplace: true,
    schemaName: '',
    tableName,
    tableComment: '',
    dbType: 'mysql',
    rows: [],
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
    authorityMocks.mergeSnapshot.mockReset().mockResolvedValue(undefined);
    authorityMocks.readSnapshot.mockReset().mockResolvedValue({
      globalDraft: null,
      drafts: [],
      savedTables: [],
      savedDrafts: [],
      folders: [],
    });
  });

  it.each([undefined, 'table-alpha'])(
    '冲突副本保留独立 ID 和草稿关联并可重复迁移 (%s)',
    async (tableId) => {
      const payload = createPayload();
      payload.snapshot.savedTables = [{ ...payload.snapshot.savedTables[0], tableId }];
      payload.snapshot.savedDrafts = [
        {
          normalizedName: 'alpha',
          tableName: 'alpha',
          state: createState('dirty'),
          baseSignature: 'base',
          updatedAt: 2,
        },
      ];
      const doc = new Y.Doc();
      importWorkspaceSnapshotToYDoc(doc, {
        ...payload.snapshot,
        savedTables: [{ ...payload.snapshot.savedTables[0], state: createState('cloud') }],
        savedDrafts: [],
      });
      authorityMocks.readSnapshot.mockImplementation(async () =>
        exportWorkspaceYDocToSnapshot(doc),
      );
      authorityMocks.mergeSnapshot.mockImplementation(async (snapshot) =>
        mergeWorkspaceSnapshotIntoYDoc(doc, snapshot),
      );
      const statement = {
        bind: () => statement,
        first: async () => null,
        run: async () => ({ success: true }),
      };
      const env = { USER_DB: { prepare: () => statement } } as never;
      await commitWorkspaceMigration(env, 'user-1', payload);
      const snapshot = exportWorkspaceYDocToSnapshot(doc);
      expect(snapshot.savedTables).toHaveLength(2);
      const copy = snapshot.savedTables.find((table) => table.name === 'alpha (Imported)');
      expect(copy?.tableId).not.toBe(
        snapshot.savedTables.find((table) => table.name === 'alpha')?.tableId,
      );
      expect(snapshot.savedDrafts[0]?.tableId).toBe(copy?.tableId);
      expect((await commitWorkspaceMigration(env, 'user-1', payload)).skippedCount).toBe(2);
      expect(exportWorkspaceYDocToSnapshot(doc).savedTables).toHaveLength(2);
      doc.destroy();
    },
  );

  it('完成标记失败后重试旧载荷，跳过所有已写入实体', async () => {
    const legacyState = {
      schemaName: '',
      tableName: 'orders',
      tableComment: '',
      dbType: 'mysql',
      rows: [{ order: 1, fieldName: 'id', fieldType: 'bigint', nullable: '否' }],
      indexes: [],
      authInput: '',
      authObjects: [],
      foreignKeys: [],
    };
    const payload = decodeWorkspaceMigrationPayload({
      localFingerprint: 'legacy-retry',
      idempotencyKey: 'retry-1',
      snapshot: {
        activeSession: null,
        globalDraft: { state: legacyState, updatedAt: 2 },
        drafts: [{ draftId: 'draft-1', state: legacyState, updatedAt: 2 }],
        savedTables: [
          {
            name: 'orders',
            normalizedName: 'orders',
            state: legacyState,
            updatedAt: 2,
          },
        ],
        savedDrafts: [
          {
            tableName: 'orders',
            normalizedName: 'orders',
            state: legacyState,
            baseSignature: 'base',
            updatedAt: 2,
          },
        ],
        folders: [{ id: 'folder-1', name: 'Folder', order: 0, createdAt: 1, updatedAt: 2 }],
      },
    });
    if (!payload) throw new Error('Invalid migration fixture');
    const doc = new Y.Doc();
    authorityMocks.readSnapshot.mockImplementation(async () => exportWorkspaceYDocToSnapshot(doc));
    authorityMocks.mergeSnapshot.mockImplementation(async (snapshot) =>
      mergeWorkspaceSnapshotIntoYDoc(doc, snapshot),
    );
    let status: string | null = null;
    let failCompletedOnce = true;
    const database = {
      prepare: () => {
        let args: unknown[] = [];
        const statement = {
          bind: (...values: unknown[]) => {
            args = values;
            return statement;
          },
          first: async () => (status ? { migrationStatus: status } : null),
          run: async () => {
            const nextStatus = args[3] as string;
            if (nextStatus === 'completed' && failCompletedOnce) {
              failCompletedOnce = false;
              throw new Error('workspace_links write failed');
            }
            status = nextStatus;
            return { success: true };
          },
        };
        return statement;
      },
    };
    const env = { USER_DB: database } as never;
    try {
      await expect(commitWorkspaceMigration(env, 'user-1', payload)).rejects.toThrow(
        'workspace_links write failed',
      );
      const firstSnapshot = exportWorkspaceYDocToSnapshot(doc);
      const analysis = await analyzeWorkspaceMigration(env, 'user-1', payload);
      expect(analysis).toMatchObject({ conflictCount: 0, skippedCount: 5 });
      const retry = await commitWorkspaceMigration(env, 'user-1', payload);
      expect(retry).toMatchObject({ createdCount: 0, copiedCount: 0, skippedCount: 5 });
      expect(exportWorkspaceYDocToSnapshot(doc)).toEqual(firstSnapshot);
      expect(authorityMocks.mergeSnapshot).toHaveBeenCalledOnce();
    } finally {
      doc.destroy();
    }
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

  it('嵌套属性顺序不同不会产生迁移冲突', async () => {
    const payload = createPayload();
    const index = {
      id: 'index-1',
      name: 'idx_id',
      unique: false,
      fields: [{ name: 'id', direction: 'ASC' as const }],
    };
    payload.snapshot.savedTables[0].state.indexes = [index];
    const existing = structuredClone(payload.snapshot);
    existing.savedTables[0].state.indexes = [
      { fields: [{ direction: 'ASC', name: 'id' }], unique: false, name: 'idx_id', id: 'index-1' },
    ];
    authorityMocks.readSnapshot.mockResolvedValue(existing);
    const statement = { bind: () => statement, first: async () => null };
    const result = await analyzeWorkspaceMigration(
      { USER_DB: { prepare: () => statement } } as never,
      'user-1',
      payload,
    );
    expect(result).toMatchObject({ conflictCount: 0, skippedCount: 3 });
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
