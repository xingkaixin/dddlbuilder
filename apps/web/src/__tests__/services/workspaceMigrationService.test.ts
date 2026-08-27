import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { setupFakeIndexedDB, teardownFakeIndexedDB } from '@/__tests__/utils/fakeIndexedDb';
import { setupMemoryLocalStorage } from '@/__tests__/utils/memoryLocalStorage';
import { clearLocalWorkspaceData } from '@/services/workspaceAccountService';
import {
  beginLegacyWorkspaceMigration,
  completeLegacyWorkspaceMigration,
  isLegacyWorkspaceMigrationCompleted,
} from '@/services/workspaceLegacyMigrationMarker';
import {
  collectWorkspaceMigrationPayload,
  hasMeaningfulWorkspaceData,
  prepareLegacyWorkspaceSnapshot,
  promoteLegacyUserWorkspaceData,
} from '@/services/workspaceMigrationService';
import {
  ensureWorkspaceYDocMeta,
  exportWorkspaceYDocToSnapshot,
  mergeWorkspaceSnapshotIntoYDoc,
} from '@/services/workspaceYDocAdapter';
import { addSavedTable, listSavedTables } from '@/utils/savedTablesDb';
import { bulkPutFolders, listFolders } from '@/utils/tableFolders';
import {
  DEFAULT_DRAFT_ID,
  listSavedDrafts,
  readDraft,
  readWorkspaceSession,
  upsertSavedDraft,
  writeDraft,
  writeWorkspaceSession,
} from '@/utils/workspaceStateDb';

const scope = {
  kind: 'user' as const,
  userId: 'user-1',
  workspaceId: 'ws-1',
};

const legacyScope = { kind: 'legacy_user' as const, userId: 'user-1' };

const createState = (tableName: string): PersistedState => ({
  schemaName: '',
  tableName,
  tableComment: '',
  dbType: 'mysql',
  sqlFormatMode: 'compact',
  rows: [
    {
      order: 1,
      fieldName: 'id',
      fieldType: 'bigint',
      fieldComment: '',
      nullable: false,
    },
  ],
  addCount: 10,
  indexInput: '',
  currentIndexFields: [],
  indexes: [],
  authInput: '',
  authObjects: [],
});

const seedLegacyWorkspace = async () => {
  await writeDraft(
    'draft-legacy',
    { state: createState('legacy_draft'), createdAt: 1, updatedAt: 2 },
    legacyScope,
  );
  await addSavedTable(
    {
      normalizedName: 'legacy_table',
      name: 'legacy_table',
      state: createState('legacy_table'),
      createdAt: 3,
      updatedAt: 4,
    },
    legacyScope,
  );
  await upsertSavedDraft(
    'legacy_table',
    {
      tableName: 'legacy_table',
      state: createState('legacy_draft_for_table'),
      baseSignature: '{}',
      updatedAt: 5,
    },
    legacyScope,
  );
  await bulkPutFolders(
    [{ id: 'folder-1', name: 'Folder', order: 1, createdAt: 6, updatedAt: 6 }],
    legacyScope,
  );
};

const createWorkspaceYDoc = () => {
  const doc = new Y.Doc();
  ensureWorkspaceYDocMeta(doc);
  return doc;
};

describe('workspaceMigrationService legacy promotion', () => {
  beforeEach(() => {
    setupFakeIndexedDB();
  });

  afterEach(() => {
    teardownFakeIndexedDB();
  });

  it.each([10, 20])('legacy 会话不能覆盖较新或同时间的草稿 (%s)', async (updatedAt) => {
    await writeDraft(
      'named',
      {
        state: createState('newer_draft'),
        createdAt: 1,
        updatedAt: 20,
        folderId: 'folder',
      },
      legacyScope,
    );
    await writeWorkspaceSession(
      {
        activeSource: { kind: 'draft', draftId: 'named' },
        activeState: createState('older_session'),
        updatedAt,
      },
      legacyScope,
    );
    const snapshot = await prepareLegacyWorkspaceSnapshot(scope);
    if (!snapshot) throw new Error('Expected legacy snapshot');
    const doc = createWorkspaceYDoc();
    mergeWorkspaceSnapshotIntoYDoc(doc, snapshot);
    expect(exportWorkspaceYDocToSnapshot(doc).drafts).toEqual([
      expect.objectContaining({
        draftId: 'named',
        state: expect.objectContaining({ tableName: 'newer_draft' }),
        createdAt: 1,
        updatedAt: 20,
        folderId: 'folder',
      }),
    ]);
    doc.destroy();
  });

  it('无字段的默认视图草稿应进入匿名迁移快照', async () => {
    const anonymous = { kind: 'anonymous' as const };
    const state: PersistedState = {
      ...createState('active_orders'),
      objectType: 'view',
      rows: [],
      viewDefinition: 'SELECT id FROM orders WHERE active = 1',
    };
    await writeDraft(DEFAULT_DRAFT_ID, { state, updatedAt: 2 }, anonymous);

    const payload = await collectWorkspaceMigrationPayload(anonymous);
    expect(payload?.snapshot.globalDraft?.state).toMatchObject(state);
    expect(await hasMeaningfulWorkspaceData(anonymous)).toBe(true);
  });

  it('仅活动会话包含视图时应保留并折叠进 Y.Doc', async () => {
    const state: PersistedState = {
      ...createState('active_orders'),
      objectType: 'view',
      rows: [],
      viewDefinition: 'SELECT id FROM orders',
    };
    await writeWorkspaceSession(
      {
        activeSource: { kind: 'draft', draftId: DEFAULT_DRAFT_ID },
        activeState: state,
        updatedAt: 3,
      },
      scope,
    );
    const snapshot = await prepareLegacyWorkspaceSnapshot(scope);
    expect(snapshot).not.toBeNull();
    if (!snapshot) throw new Error('Expected view snapshot');
    const doc = createWorkspaceYDoc();
    mergeWorkspaceSnapshotIntoYDoc(doc, snapshot);
    expect(exportWorkspaceYDocToSnapshot(doc).drafts[0]).toMatchObject({
      draftId: DEFAULT_DRAFT_ID,
      state: { objectType: 'view', rows: [], viewDefinition: state.viewDefinition },
    });
    doc.destroy();
  });

  it.each([
    { objectType: 'view' as const, viewDefinition: ' \n ', rows: createState('').rows },
    { objectType: 'table' as const, viewDefinition: 'SELECT 1', rows: [] },
    { rows: [] },
  ])('空草稿不应因非当前对象内容而触发迁移 (%j)', async (content) => {
    await writeDraft(
      DEFAULT_DRAFT_ID,
      {
        state: { ...createState(''), ...content },
        updatedAt: 1,
      },
      scope,
    );
    expect(await collectWorkspaceMigrationPayload(scope)).toBeNull();
  });

  it('迁移快照保留表与草稿的稳定 ID', async () => {
    await addSavedTable(
      {
        tableId: 'stable-table',
        normalizedName: 'saved',
        name: 'Saved',
        state: createState('saved'),
        createdAt: 1,
        updatedAt: 2,
      },
      legacyScope,
    );
    await upsertSavedDraft(
      'saved',
      {
        tableId: 'stable-table',
        tableName: 'Saved',
        state: createState('dirty'),
        baseSignature: 'base',
        updatedAt: 3,
      },
      legacyScope,
    );
    const snapshot = await prepareLegacyWorkspaceSnapshot(scope);
    expect(snapshot?.savedTables[0]?.tableId).toBe('stable-table');
    expect(snapshot?.savedDrafts[0]?.tableId).toBe('stable-table');
  });

  it('应将旧 user scope 工作区数据写入默认 workspace scope', async () => {
    await seedLegacyWorkspace();
    await writeWorkspaceSession(
      {
        activeSource: { kind: 'draft', draftId: 'draft-legacy' },
        activeState: createState('legacy_draft'),
        updatedAt: 7,
      },
      legacyScope,
    );

    const migrated = await promoteLegacyUserWorkspaceData(scope);

    expect(migrated).toBe(true);
    expect((await readDraft('draft-legacy', scope))?.state.tableName).toBe('legacy_draft');
    expect((await listSavedTables(scope)).map((item) => item.normalizedName)).toEqual([
      'legacy_table',
    ]);
    expect(Object.keys(await listSavedDrafts(scope))).toEqual(['legacy_table']);
    expect((await listFolders(scope)).map((item) => item.id)).toEqual(['folder-1']);
    expect(await readWorkspaceSession(scope)).toMatchObject({
      activeSource: { kind: 'draft', draftId: 'draft-legacy' },
    });
  });

  it('上次提升中途失败后重跑应补齐剩余数据', async () => {
    await seedLegacyWorkspace();
    // 只提升到 draft 就失败了：目标分区“有内容”不能再当作“已提升过”。
    await writeDraft(
      'draft-legacy',
      { state: createState('legacy_draft'), createdAt: 1, updatedAt: 2 },
      scope,
    );

    expect(await promoteLegacyUserWorkspaceData(scope)).toBe(true);
    expect((await listSavedTables(scope)).map((item) => item.normalizedName)).toEqual([
      'legacy_table',
    ]);
    expect(Object.keys(await listSavedDrafts(scope))).toEqual(['legacy_table']);
    expect((await listFolders(scope)).map((item) => item.id)).toEqual(['folder-1']);
  });

  it('目标分区里更新的记录不应被 legacy 覆盖', async () => {
    await seedLegacyWorkspace();
    // 模拟提升期间目标分区已存在更新的同名表。
    await addSavedTable(
      {
        normalizedName: 'legacy_table',
        name: 'legacy_table',
        state: createState('pulled_table'),
        createdAt: 3,
        updatedAt: 999,
      },
      scope,
    );

    expect(await promoteLegacyUserWorkspaceData(scope)).toBe(true);
    expect((await listSavedTables(scope))[0]?.state.tableName).toBe('pulled_table');
    expect((await readDraft('draft-legacy', scope))?.state.tableName).toBe('legacy_draft');
  });

  it('legacy 数据应提升后被读到并完整合并进 Y.Doc', async () => {
    await seedLegacyWorkspace();
    await writeWorkspaceSession(
      {
        activeSource: { kind: 'draft', draftId: 'draft-legacy' },
        activeState: createState('legacy_draft_editing'),
        updatedAt: 7,
      },
      legacyScope,
    );

    const snapshot = await prepareLegacyWorkspaceSnapshot(scope);
    expect(snapshot).not.toBeNull();
    if (!snapshot) throw new Error('Expected legacy snapshot');

    const doc = createWorkspaceYDoc();
    mergeWorkspaceSnapshotIntoYDoc(doc, snapshot);
    const merged = exportWorkspaceYDocToSnapshot(doc);

    expect(merged.drafts).toEqual([
      expect.objectContaining({
        draftId: 'draft-legacy',
        createdAt: 1,
        updatedAt: 7,
      }),
    ]);
    // activeSession.activeState 折叠进同名 draft，覆盖较旧的 draft 记录
    expect(merged.drafts[0]?.state.tableName).toBe('legacy_draft_editing');
    expect(merged.savedTables.map((item) => item.normalizedName)).toEqual(['legacy_table']);
    expect(merged.savedTables[0]?.state.tableName).toBe('legacy_table');
    expect(merged.savedDrafts).toEqual([
      expect.objectContaining({
        normalizedName: 'legacy_table',
        tableName: 'legacy_table',
        baseSignature: '{}',
      }),
    ]);
    expect(merged.savedDrafts[0]?.state.tableName).toBe('legacy_draft_for_table');
    expect(merged.folders).toEqual([expect.objectContaining({ id: 'folder-1', name: 'Folder' })]);

    doc.destroy();
  });

  it('活动 session 指向默认草稿时应作为独立 draft 折叠进 Y.Doc', async () => {
    await seedLegacyWorkspace();
    await writeWorkspaceSession(
      {
        activeSource: { kind: 'draft', draftId: DEFAULT_DRAFT_ID },
        activeState: createState('legacy_global_editing'),
        updatedAt: 9,
      },
      legacyScope,
    );

    const snapshot = await prepareLegacyWorkspaceSnapshot(scope);
    if (!snapshot) throw new Error('Expected legacy snapshot');

    const doc = createWorkspaceYDoc();
    mergeWorkspaceSnapshotIntoYDoc(doc, snapshot);
    const merged = exportWorkspaceYDocToSnapshot(doc);

    expect(merged.drafts.find((draft) => draft.draftId === DEFAULT_DRAFT_ID)?.state.tableName).toBe(
      'legacy_global_editing',
    );
    expect(merged.drafts.find((draft) => draft.draftId === 'draft-legacy')?.state.tableName).toBe(
      'legacy_draft',
    );

    doc.destroy();
  });

  it('保存表 createdAt 应原样进入 Y.Doc，不退化成 updatedAt', async () => {
    await addSavedTable(
      {
        normalizedName: 'dated_table',
        name: 'dated_table',
        state: createState('dated_table'),
        createdAt: 111,
        updatedAt: 222,
      },
      legacyScope,
    );

    const snapshot = await prepareLegacyWorkspaceSnapshot(scope);
    if (!snapshot) throw new Error('Expected legacy snapshot');

    expect((await listSavedTables(scope))[0]?.createdAt).toBe(111);
    expect(snapshot.savedTables[0]?.createdAt).toBe(111);

    const doc = createWorkspaceYDoc();
    mergeWorkspaceSnapshotIntoYDoc(doc, snapshot);
    const merged = exportWorkspaceYDocToSnapshot(doc);

    expect(merged.savedTables[0]).toMatchObject({
      normalizedName: 'dated_table',
      createdAt: 111,
      updatedAt: 222,
    });

    doc.destroy();
  });

  it('没有 legacy 数据时应返回 null', async () => {
    expect(await prepareLegacyWorkspaceSnapshot(scope)).toBeNull();
  });

  it('退出登录清空目标分区后不应重新提升陈旧 legacy 快照', async () => {
    vi.clearAllMocks();
    setupMemoryLocalStorage();
    await seedLegacyWorkspace();

    const migrationToken = beginLegacyWorkspaceMigration(scope);
    await prepareLegacyWorkspaceSnapshot(scope);
    completeLegacyWorkspaceMigration(scope, migrationToken);

    await clearLocalWorkspaceData(scope);

    expect(await listSavedTables(scope)).toEqual([]);
    // 完成标记不在被清空的分区里，下次启动仍然跳过整段 legacy 步骤。
    expect(isLegacyWorkspaceMigrationCompleted(scope)).toBe(true);
  });
});
