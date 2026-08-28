import * as Y from 'yjs';
import {
  decodeWorkspaceMigrationPayload,
  importWorkspaceSnapshotToYDoc,
  exportWorkspaceYDocToSnapshot,
} from '@ddlbuilder/workspace-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSqliteD1Database } from '../helpers/sqliteD1.js';
import {
  toSchemaDocumentState,
  withDefaultEditorSession,
  type SchemaDocumentState,
} from '@ddlbuilder/shared-types';
import type { WorkspaceMigrationPayload } from '@ddlbuilder/shared-types/workspace';
import {
  analyzeWorkspaceMigration,
  applyWorkspaceMigrationSnapshot,
  commitWorkspaceMigration,
} from '../../lib/workspaceMigration.js';

const authorityMocks = vi.hoisted(() => ({
  readSnapshot: vi.fn(),
  migrateSnapshot: vi.fn(),
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
  it('stores only confirmed migrations with a creation timestamp', async () => {
    const { database, sqlite } = createSqliteD1Database({ includeMeta: true });
    sqlite
      .prepare('INSERT INTO user (id, name, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run('user-1', 'User', 'user@example.com', 1, 1);
    let resume!: () => void;
    const gate = new Promise<void>((resolve) => {
      resume = resolve;
    });
    authorityMocks.migrateSnapshot.mockImplementationOnce(async () => {
      await gate;
      return { status: 'completed' };
    });
    const task = commitWorkspaceMigration(
      { USER_DB: database } as never,
      'user-1',
      createPayload(),
    );
    await vi.waitFor(() => expect(authorityMocks.migrateSnapshot).toHaveBeenCalled());
    const inProgress = sqlite.prepare('SELECT migration_status FROM workspace_links').all();
    resume();
    await task;
    const completed = sqlite
      .prepare('SELECT migration_status, created_at FROM workspace_links')
      .get();
    sqlite.close();
    expect(inProgress).toEqual([]);
    expect(completed?.migration_status).toBe('completed');
    expect(Number(completed?.created_at)).toBeGreaterThan(0);
  });
  let cloudDoc: Y.Doc;
  beforeEach(() => {
    vi.clearAllMocks();
    cloudDoc = new Y.Doc();
    authorityMocks.readSnapshot
      .mockReset()
      .mockImplementation(async () => exportWorkspaceYDocToSnapshot(cloudDoc));
    authorityMocks.migrateSnapshot
      .mockReset()
      .mockImplementation(async (snapshot) =>
        applyWorkspaceMigrationSnapshot(cloudDoc, 'user-1', snapshot),
      );
  });

  afterEach(() => cloudDoc.destroy());

  it.each([1, 2, 3])('迁移活动草稿时保留身份并选择较新内容 (%s)', async (updatedAt) => {
    const payload = decodeWorkspaceMigrationPayload({
      ...createPayload(),
      snapshot: {
        ...createPayload().snapshot,
        savedTables: [],
        globalDraft: { state: createState('unrelated_global'), updatedAt: 1 },
        drafts: [{ draftId: 'named', state: createState('stored'), createdAt: 1, updatedAt: 2 }],
        activeSession: {
          activeSource: { kind: 'draft', draftId: 'named' },
          activeState: withDefaultEditorSession(createState('session')),
          updatedAt,
        },
      },
    });
    if (!payload) throw new Error('Invalid migration fixture');
    const statement = {
      bind: () => statement,
      first: async () => null,
      run: async () => ({ success: true }),
    };
    const env = { USER_DB: { prepare: () => statement } } as never;
    expect(await analyzeWorkspaceMigration(env, 'user-1', payload)).toMatchObject({
      createdCount: 2,
      conflictCount: 0,
    });
    expect(await commitWorkspaceMigration(env, 'user-1', payload)).toMatchObject({
      createdCount: 2,
    });
    const migrated = exportWorkspaceYDocToSnapshot(cloudDoc);
    expect(migrated.drafts).toHaveLength(2);
    expect(migrated.drafts.find((draft) => draft.draftId === 'default')?.state.tableName).toBe(
      'unrelated_global',
    );
    expect(migrated.drafts.find((draft) => draft.draftId === 'named')).toMatchObject({
      state: { tableName: updatedAt > 2 ? 'session' : 'stored' },
      createdAt: 1,
      updatedAt: Math.max(2, updatedAt),
    });
    expect(await commitWorkspaceMigration(env, 'user-1', payload)).toMatchObject({
      createdCount: 0,
      skippedCount: 2,
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
      const doc = cloudDoc;
      importWorkspaceSnapshotToYDoc(doc, {
        ...payload.snapshot,
        savedTables: [{ ...payload.snapshot.savedTables[0], state: createState('cloud') }],
        savedDrafts: [],
      });
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
    const doc = cloudDoc;
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
    await expect(commitWorkspaceMigration(env, 'user-1', payload)).rejects.toThrow(
      'workspace_links write failed',
    );
    const firstSnapshot = exportWorkspaceYDocToSnapshot(doc);
    const analysis = await analyzeWorkspaceMigration(env, 'user-1', payload);
    expect(analysis).toMatchObject({ conflictCount: 0, skippedCount: 5 });
    const onUpdate = vi.fn();
    doc.on('update', onUpdate);
    const retry = await commitWorkspaceMigration(env, 'user-1', payload);
    expect(retry).toMatchObject({ createdCount: 0, copiedCount: 0, skippedCount: 5 });
    expect(exportWorkspaceYDocToSnapshot(doc)).toEqual(firstSnapshot);
    expect(onUpdate).not.toHaveBeenCalled();
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

  it('提交迁移由文档持有方解决冲突，调用方不预读快照', async () => {
    const queries: string[] = [];
    importWorkspaceSnapshotToYDoc(cloudDoc, {
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
    expect(authorityMocks.migrateSnapshot).toHaveBeenCalledOnce();
    expect(authorityMocks.readSnapshot).not.toHaveBeenCalled();
    expect(exportWorkspaceYDocToSnapshot(cloudDoc).savedTables).toContainEqual(
      expect.objectContaining({
        normalizedName: 'alpha (imported)',
        name: 'alpha (Imported)',
      }),
    );
  });

  it('重复迁移时复用已有导入副本', async () => {
    const payload = createPayload();
    payload.snapshot.savedTables = payload.snapshot.savedTables.slice(0, 1);
    importWorkspaceSnapshotToYDoc(cloudDoc, {
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

    const onUpdate = vi.fn();
    cloudDoc.on('update', onUpdate);
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
    expect(onUpdate).not.toHaveBeenCalled();
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
    importWorkspaceSnapshotToYDoc(cloudDoc, existing);
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
    importWorkspaceSnapshotToYDoc(cloudDoc, payload.snapshot);
    const onUpdate = vi.fn();
    cloudDoc.on('update', onUpdate);
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
    expect(onUpdate).not.toHaveBeenCalled();
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
    importWorkspaceSnapshotToYDoc(cloudDoc, {
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

    const snapshot = exportWorkspaceYDocToSnapshot(cloudDoc);
    const table = snapshot.savedTables.find((item) => item.name === 'alpha (Imported)');
    const draft = snapshot.savedDrafts[0];
    const folder = snapshot.folders.find(
      (item: { name: string }) => item.name === 'Local (Imported)',
    );
    const child = snapshot.folders.find((item: { name: string }) => item.name === 'Child');

    expect(table).toBeDefined();
    expect(folder).toBeDefined();
    expect(child).toBeDefined();
    expect(draft.normalizedName).toBe(table?.normalizedName);
    expect(table?.folderId).toBe(folder?.id);
    expect(child?.parentId).toBe(folder?.id);
  });
});
