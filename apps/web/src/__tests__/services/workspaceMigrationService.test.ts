import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { setupFakeIndexedDB, teardownFakeIndexedDB } from '@/__tests__/utils/fakeIndexedDb';
import {
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
import { listWorkspaceOutboxItems } from '@/utils/workspaceSyncStateDb';

const scope = {
  kind: 'user' as const,
  userId: 'user-1',
  workspaceId: 'ws-1',
};

const legacyScope = { kind: 'user' as const, userId: 'user-1' };

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
  await bulkPutFolders([{ id: 'folder-1', name: 'Folder', order: 1, createdAt: 6 }], legacyScope);
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

  it('应将旧 user scope 工作区数据写入默认 workspace scope 且不入队 outbox', async () => {
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
    expect(await listWorkspaceOutboxItems('ws-1')).toEqual([]);
  });

  it('目标分区已有内容时不应覆盖', async () => {
    await seedLegacyWorkspace();
    await writeDraft('draft-current', { state: createState('current'), updatedAt: 10 }, scope);

    expect(await promoteLegacyUserWorkspaceData(scope)).toBe(false);
    expect(await readDraft('draft-legacy', scope)).toBeNull();
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
    expect(await listWorkspaceOutboxItems('ws-1')).toEqual([]);

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
});
