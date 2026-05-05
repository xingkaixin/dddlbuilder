import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import type { PersistedState } from '@ddlbuilder/shared-types';
import {
  exportWorkspaceYDocToSnapshot,
  getDraftRecordFromYDoc,
  importWorkspaceSnapshotToYDoc,
  deleteDraftFromYDoc,
  mergeWorkspaceSnapshotIntoYDoc,
  listFoldersFromYDoc,
  upsertDraftInYDoc,
  upsertFolderInYDoc,
} from '@/services/workspaceYDocAdapter';
import { DEFAULT_DRAFT_ID } from '@/utils/workspaceStateDb';

const createState = (overrides: Partial<PersistedState> = {}): PersistedState => ({
  schemaName: 'public',
  objectType: 'table',
  tableName: 'users',
  tableComment: '用户表',
  dbType: 'mysql',
  sqlFormatMode: 'compact',
  viewDefinition: '',
  viewCreateOrReplace: true,
  rows: [
    {
      order: 1,
      fieldName: 'id',
      fieldType: 'bigint',
      fieldComment: '主键',
      nullable: '否',
      defaultKind: '自增',
      defaultValue: '',
      onUpdate: '无',
    },
    {
      order: 2,
      fieldName: 'email',
      fieldType: 'varchar(255)',
      fieldComment: '邮箱',
      nullable: '否',
      defaultKind: '无',
      defaultValue: '',
      onUpdate: '无',
    },
  ],
  addCount: 12,
  indexInput: '',
  currentIndexFields: [{ name: 'email', direction: 'ASC' }],
  indexes: [
    {
      id: 'idx_email',
      name: 'idx_users_email',
      fields: [{ name: 'email', direction: 'ASC' }],
      unique: true,
    },
  ],
  authInput: 'app_user',
  authObjects: ['app_user'],
  mysqlPartitionConfig: {
    enabled: true,
    type: 'HASH',
    columns: ['id'],
    partitionCount: 8,
  },
  tableMiscConfig: {
    enabled: true,
    engine: 'InnoDB',
    charset: 'utf8mb4',
  },
  fieldTableViewConfig: {
    freezeEnabled: true,
    freezeColumns: 2,
  },
  foreignKeys: [
    {
      id: 'fk_user_org',
      name: 'fk_user_org',
      fields: ['org_id'],
      refTable: 'orgs',
      refFields: ['id'],
      onDelete: 'CASCADE',
    },
  ],
  ...overrides,
});

const getFirstFieldId = (doc: Y.Doc) => {
  const tableDoc = doc.getMap<Y.Map<unknown>>('drafts').get(DEFAULT_DRAFT_ID);
  const fieldOrder = tableDoc?.get('fieldOrder');
  return fieldOrder instanceof Y.Array ? fieldOrder.get(0) : null;
};

describe('workspaceYDocAdapter', () => {
  it('imports and exports workspace content without losing table data', () => {
    const doc = new Y.Doc();
    const state = createState();

    importWorkspaceSnapshotToYDoc(doc, {
      globalDraft: { state, updatedAt: 100 },
      drafts: [],
      savedTables: [
        {
          normalizedName: 'users',
          name: 'Users',
          state,
          createdAt: 90,
          updatedAt: 110,
          folderId: 'folder-1',
        },
      ],
      savedDrafts: [
        {
          normalizedName: 'users',
          tableName: 'Users',
          state: createState({ tableComment: '本地草稿' }),
          updatedAt: 120,
          baseSignature: JSON.stringify(state),
        },
      ],
      folders: [{ id: 'folder-1', name: 'Core', order: 1, createdAt: 80 }],
    });

    const exported = exportWorkspaceYDocToSnapshot(doc);

    expect(getDraftRecordFromYDoc(doc, DEFAULT_DRAFT_ID)?.state).toEqual(state);
    expect(exported.savedTables[0]).toMatchObject({
      normalizedName: 'users',
      name: 'Users',
      folderId: 'folder-1',
      state,
    });
    expect(exported.savedDrafts[0].state.tableComment).toBe('本地草稿');
    expect(exported.folders).toEqual([{ id: 'folder-1', name: 'Core', order: 1, createdAt: 80 }]);
  });

  it('keeps field ids stable while applying full persisted states', () => {
    const doc = new Y.Doc();
    const state = createState();

    upsertDraftInYDoc(doc, DEFAULT_DRAFT_ID, { state, updatedAt: 1 });
    const firstFieldId = getFirstFieldId(doc);
    upsertDraftInYDoc(doc, DEFAULT_DRAFT_ID, {
      state: createState({
        rows: [{ ...state.rows[0], fieldName: 'user_id' }, state.rows[1]],
      }),
      updatedAt: 2,
    });

    expect(getFirstFieldId(doc)).toBe(firstFieldId);
    expect(getDraftRecordFromYDoc(doc, DEFAULT_DRAFT_ID)?.state.rows[0].fieldName).toBe('user_id');
  });

  it('reads full state snapshots instead of reconstructed field maps', () => {
    const doc = new Y.Doc();
    const state = createState({
      schemaName: 'tenant_1',
      tableName: 'orders',
      tableComment: '订单表',
      rows: [
        { ...createState().rows[0], fieldName: 'order_id', fieldComment: '订单 ID' },
        { ...createState().rows[1], fieldName: 'buyer_email', fieldComment: '买家邮箱' },
      ],
    });

    upsertDraftInYDoc(doc, DEFAULT_DRAFT_ID, { state, updatedAt: 1 });

    expect(getDraftRecordFromYDoc(doc, DEFAULT_DRAFT_ID)?.state).toEqual(state);
  });

  it('merges local snapshot records missing from an existing ydoc', () => {
    const doc = new Y.Doc();
    upsertDraftInYDoc(doc, 'local_existing', {
      state: createState({ tableName: 'existing_remote' }),
      updatedAt: 200,
    });

    mergeWorkspaceSnapshotIntoYDoc(doc, {
      globalDraft: null,
      drafts: [
        {
          draftId: 'local_existing',
          state: createState({ tableName: 'stale_local' }),
          updatedAt: 100,
        },
        {
          draftId: 'local_missing',
          state: createState({ tableName: 'missing_local' }),
          updatedAt: 150,
        },
      ],
      savedTables: [],
      savedDrafts: [],
      folders: [],
    });

    expect(getDraftRecordFromYDoc(doc, 'local_existing')?.state.tableName).toBe('existing_remote');
    expect(getDraftRecordFromYDoc(doc, 'local_missing')?.state.tableName).toBe('missing_local');
  });

  it('converges concurrent full-state writes', () => {
    const seed = new Y.Doc();
    const state = createState();
    upsertDraftInYDoc(seed, DEFAULT_DRAFT_ID, { state, updatedAt: 1 });
    const seedUpdate = Y.encodeStateAsUpdate(seed);

    const left = new Y.Doc();
    const right = new Y.Doc();
    Y.applyUpdate(left, seedUpdate);
    Y.applyUpdate(right, seedUpdate);

    const leftUpdates: Uint8Array[] = [];
    const rightUpdates: Uint8Array[] = [];
    left.on('update', (update) => leftUpdates.push(update));
    right.on('update', (update) => rightUpdates.push(update));

    upsertDraftInYDoc(left, DEFAULT_DRAFT_ID, {
      state: createState({
        rows: [{ ...state.rows[0], fieldName: 'user_id' }, state.rows[1]],
      }),
      updatedAt: 2,
    });
    upsertDraftInYDoc(right, DEFAULT_DRAFT_ID, {
      state: createState({
        rows: [{ ...state.rows[0], fieldComment: '用户 ID' }, state.rows[1]],
      }),
      updatedAt: 3,
    });

    for (const update of leftUpdates) Y.applyUpdate(right, update);
    for (const update of rightUpdates) Y.applyUpdate(left, update);

    const leftState = getDraftRecordFromYDoc(left, DEFAULT_DRAFT_ID)?.state;
    const rightState = getDraftRecordFromYDoc(right, DEFAULT_DRAFT_ID)?.state;
    expect(rightState).toEqual(leftState);
    expect([state.rows[0].fieldName, 'user_id']).toContain(leftState?.rows[0].fieldName);
    expect([state.rows[0].fieldComment, '用户 ID']).toContain(leftState?.rows[0].fieldComment);
  });

  it('converges sequential create, delete, field update, and folder move updates', () => {
    const left = new Y.Doc();
    const right = new Y.Doc();
    const leftUpdates: Uint8Array[] = [];
    const rightUpdates: Uint8Array[] = [];

    left.on('update', (update) => leftUpdates.push(update));
    right.on('update', (update) => rightUpdates.push(update));

    upsertDraftInYDoc(left, DEFAULT_DRAFT_ID, {
      state: createState({ tableName: 'users_v1' }),
      updatedAt: 1,
    });
    for (const update of leftUpdates.splice(0)) Y.applyUpdate(right, update);

    upsertDraftInYDoc(right, DEFAULT_DRAFT_ID, {
      state: createState({
        tableName: 'users_v2',
        rows: [{ ...createState().rows[0], fieldName: 'user_id' }, createState().rows[1]],
      }),
      updatedAt: 2,
    });
    upsertFolderInYDoc(right, { id: 'folder-1', name: 'Core', order: 1, createdAt: 3 });
    for (const update of rightUpdates.splice(0)) Y.applyUpdate(left, update);

    upsertFolderInYDoc(left, {
      id: 'folder-1',
      name: 'Core',
      parentId: 'folder-root',
      order: 2,
      createdAt: 3,
    });
    deleteDraftFromYDoc(left, DEFAULT_DRAFT_ID);
    for (const update of leftUpdates.splice(0)) Y.applyUpdate(right, update);

    expect(getDraftRecordFromYDoc(left, DEFAULT_DRAFT_ID)).toBeNull();
    expect(getDraftRecordFromYDoc(right, DEFAULT_DRAFT_ID)).toBeNull();
    expect(listFoldersFromYDoc(left)).toEqual(listFoldersFromYDoc(right));
    expect(listFoldersFromYDoc(right)).toEqual([
      {
        id: 'folder-1',
        name: 'Core',
        parentId: 'folder-root',
        order: 2,
        createdAt: 3,
      },
    ]);
  });
});
