import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import type { PersistedState } from '@ddlbuilder/shared-types';
import {
  exportWorkspaceYDocToSnapshot,
  getDraftRecordFromYDoc,
  importWorkspaceSnapshotToYDoc,
  deleteDraftFromYDoc,
  deleteSavedTableFromYDoc,
  getSavedTableFromYDoc,
  mergeWorkspaceSnapshotIntoYDoc,
  materializeWorkspaceYDoc,
  listFoldersFromYDoc,
  subscribeWorkspaceYDoc,
  upsertDraftInYDoc,
  upsertFolderInYDoc,
  upsertSavedTableInYDoc,
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
      nullable: false,
      defaultKind: 'auto_increment',
      defaultValue: '',
      onUpdate: 'none',
    },
    {
      order: 2,
      fieldName: 'email',
      fieldType: 'varchar(255)',
      fieldComment: '邮箱',
      nullable: false,
      defaultKind: 'none',
      defaultValue: '',
      onUpdate: 'none',
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

const createSyncedDocs = () => {
  const seed = new Y.Doc();
  upsertDraftInYDoc(seed, DEFAULT_DRAFT_ID, { state: createState(), updatedAt: 1 });
  const seedUpdate = Y.encodeStateAsUpdate(seed);
  const left = new Y.Doc();
  const right = new Y.Doc();
  Y.applyUpdate(left, seedUpdate);
  Y.applyUpdate(right, seedUpdate);
  return { left, right };
};

const createSnapshotOnlySyncedDocs = () => {
  const seed = new Y.Doc();
  const draft = new Y.Map<unknown>();
  const metadata = new Y.Map<unknown>();
  metadata.set('updatedAt', 1);
  draft.set('metadata', metadata);
  draft.set('stateSnapshot', createState());
  seed.getMap<Y.Map<unknown>>('drafts').set(DEFAULT_DRAFT_ID, draft);
  const seedUpdate = Y.encodeStateAsUpdate(seed);
  const left = new Y.Doc();
  const right = new Y.Doc();
  Y.applyUpdate(left, seedUpdate);
  Y.applyUpdate(right, seedUpdate);
  return { left, right };
};

const mergeDocs = (left: Y.Doc, right: Y.Doc) => {
  const leftUpdate = Y.encodeStateAsUpdate(left);
  const rightUpdate = Y.encodeStateAsUpdate(right);
  Y.applyUpdate(left, rightUpdate);
  Y.applyUpdate(right, leftUpdate);
};

const readDefaultDraftState = (doc: Y.Doc) => getDraftRecordFromYDoc(doc, DEFAULT_DRAFT_ID)?.state;

describe('workspaceYDocAdapter', () => {
  it('subscribes only to requested collections and reports changed entity ids', () => {
    const doc = new Y.Doc();
    const changes: Array<{ collection: string; entityIds: ReadonlySet<string> }> = [];
    const unsubscribe = subscribeWorkspaceYDoc(doc, (change) => changes.push(change), [
      'savedTables',
    ]);

    upsertFolderInYDoc(doc, {
      id: 'folder-1',
      name: 'Folder',
      order: 0,
      createdAt: 1,
    });
    doc.transact(() => {
      upsertSavedTableInYDoc(doc, {
        normalizedName: 'users',
        name: 'Users',
        state: createState(),
        createdAt: 1,
        updatedAt: 1,
      });
    });
    unsubscribe();

    expect(changes).toHaveLength(1);
    expect(changes[0].collection).toBe('savedTables');
    expect([...changes[0].entityIds]).toEqual(['users']);
  });

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

  it('merges unrelated edits when the remote seed only has a snapshot', () => {
    const { left, right } = createSnapshotOnlySyncedDocs();
    const state = createState();

    upsertDraftInYDoc(left, DEFAULT_DRAFT_ID, {
      state: createState({
        rows: [{ ...state.rows[0], fieldName: 'user_id' }, state.rows[1]],
      }),
      updatedAt: 2,
    });
    upsertDraftInYDoc(right, DEFAULT_DRAFT_ID, {
      state: createState({ tableName: 'accounts' }),
      updatedAt: 3,
    });
    mergeDocs(left, right);

    expect(readDefaultDraftState(left)?.tableName).toBe('accounts');
    expect(readDefaultDraftState(left)?.rows.map((row) => row.fieldName)).toEqual([
      'user_id',
      'email',
    ]);
    expect(readDefaultDraftState(right)).toEqual(readDefaultDraftState(left));
  });

  it('materializes snapshot-only drafts into fine-grained table data', () => {
    const { left } = createSnapshotOnlySyncedDocs();
    const tableDoc = left.getMap<Y.Map<unknown>>('drafts').get(DEFAULT_DRAFT_ID);

    expect(materializeWorkspaceYDoc(left)).toBe(true);

    expect(tableDoc?.get('scalar')).toBeInstanceOf(Y.Map);
    expect(tableDoc?.get('fields')).toBeInstanceOf(Y.Map);
    expect(tableDoc?.get('fieldOrder')).toBeInstanceOf(Y.Array);
    expect(readDefaultDraftState(left)).toEqual(createState());
  });

  it('keeps field docs when compact writes only change table scalars', () => {
    const doc = new Y.Doc();
    const state = createState();

    upsertDraftInYDoc(doc, DEFAULT_DRAFT_ID, { state, updatedAt: 1 });
    upsertDraftInYDoc(
      doc,
      DEFAULT_DRAFT_ID,
      {
        state: createState({ tableName: 'accounts' }),
        updatedAt: 2,
      },
      { compactSnapshotBase: true },
    );

    const tableDoc = doc.getMap<Y.Map<unknown>>('drafts').get(DEFAULT_DRAFT_ID);
    expect(tableDoc?.get('fields')).toBeInstanceOf(Y.Map);
    expect(tableDoc?.get('fieldOrder')).toBeInstanceOf(Y.Array);
    expect(readDefaultDraftState(doc)).toMatchObject({
      tableName: 'accounts',
      rows: state.rows,
    });
  });

  it('can compact-save a field value back to the snapshot value', () => {
    const doc = new Y.Doc();
    const state = createState();

    upsertDraftInYDoc(doc, DEFAULT_DRAFT_ID, { state, updatedAt: 1 });
    upsertDraftInYDoc(
      doc,
      DEFAULT_DRAFT_ID,
      {
        state: createState({
          rows: [{ ...state.rows[0], fieldName: 'user_id' }, state.rows[1]],
        }),
        updatedAt: 2,
      },
      { compactSnapshotBase: true },
    );
    upsertDraftInYDoc(
      doc,
      DEFAULT_DRAFT_ID,
      {
        state,
        updatedAt: 3,
      },
      { compactSnapshotBase: true },
    );

    expect(readDefaultDraftState(doc)?.rows[0].fieldName).toBe('id');
  });

  it('does not emit updates when applying the same table state', () => {
    const doc = new Y.Doc();
    const state = createState();
    upsertDraftInYDoc(doc, DEFAULT_DRAFT_ID, { state, updatedAt: 1 });
    const updates: Uint8Array[] = [];
    doc.on('update', (update) => updates.push(update));

    upsertDraftInYDoc(doc, DEFAULT_DRAFT_ID, { state: createState(), updatedAt: 1 });

    expect(updates).toHaveLength(0);
  });

  it('omits empty foreign keys when reading fine-grained table state', () => {
    const doc = new Y.Doc();
    const state = createState({ foreignKeys: undefined });

    upsertDraftInYDoc(doc, DEFAULT_DRAFT_ID, { state, updatedAt: 1 });

    expect(getDraftRecordFromYDoc(doc, DEFAULT_DRAFT_ID)?.state.foreignKeys).toBeUndefined();
  });

  it('preserves cleared fine-grained collections instead of reviving snapshot data', () => {
    const doc = new Y.Doc();
    const state = createState();
    upsertDraftInYDoc(doc, DEFAULT_DRAFT_ID, { state, updatedAt: 1 });

    upsertDraftInYDoc(
      doc,
      DEFAULT_DRAFT_ID,
      {
        state: createState({ rows: [], indexes: [], foreignKeys: [] }),
        updatedAt: 2,
      },
      { compactSnapshotBase: true },
    );

    const restored = getDraftRecordFromYDoc(doc, DEFAULT_DRAFT_ID)?.state;
    expect(restored?.rows).toEqual([]);
    expect(restored?.indexes).toEqual([]);
    expect(restored?.foreignKeys ?? []).toEqual([]);
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

  it('prefers fine-grained table data over stale state snapshots', () => {
    const doc = new Y.Doc();
    const state = createState({ tableName: 'fine_grained' });

    upsertDraftInYDoc(doc, DEFAULT_DRAFT_ID, { state, updatedAt: 1 });
    const tableDoc = doc.getMap<Y.Map<unknown>>('drafts').get(DEFAULT_DRAFT_ID);
    expect(tableDoc).toBeInstanceOf(Y.Map);
    (tableDoc as Y.Map<unknown>).set('stateSnapshot', createState({ tableName: 'stale' }));

    expect(getDraftRecordFromYDoc(doc, DEFAULT_DRAFT_ID)?.state.tableName).toBe('fine_grained');
  });

  it('merges concurrent edits to different properties of the same field', () => {
    const { left, right } = createSyncedDocs();
    const state = createState();

    upsertDraftInYDoc(left, DEFAULT_DRAFT_ID, {
      state: createState({
        rows: [{ ...state.rows[0], fieldName: 'user_id' }, state.rows[1]],
      }),
      updatedAt: 2,
    });
    upsertDraftInYDoc(right, DEFAULT_DRAFT_ID, {
      state: createState({
        rows: [{ ...state.rows[0], fieldType: 'varchar(32)' }, state.rows[1]],
      }),
      updatedAt: 3,
    });

    mergeDocs(left, right);

    expect(readDefaultDraftState(left)?.rows[0]).toMatchObject({
      fieldName: 'user_id',
      fieldType: 'varchar(32)',
    });
    expect(readDefaultDraftState(right)).toEqual(readDefaultDraftState(left));
  });

  it('merges concurrent table name and field name edits', () => {
    const { left, right } = createSyncedDocs();
    const state = createState();

    upsertDraftInYDoc(left, DEFAULT_DRAFT_ID, {
      state: createState({
        tableName: 'accounts',
      }),
      updatedAt: 2,
    });
    upsertDraftInYDoc(right, DEFAULT_DRAFT_ID, {
      state: createState({
        rows: [{ ...state.rows[0], fieldName: 'user_id' }, state.rows[1]],
      }),
      updatedAt: 3,
    });

    mergeDocs(left, right);

    expect(readDefaultDraftState(left)).toMatchObject({
      tableName: 'accounts',
      rows: [expect.objectContaining({ fieldName: 'user_id' }), state.rows[1]],
    });
    expect(readDefaultDraftState(right)).toEqual(readDefaultDraftState(left));
  });

  it('keeps field deletion visible when another client edits the deleted field', () => {
    const { left, right } = createSyncedDocs();
    const state = createState();

    upsertDraftInYDoc(left, DEFAULT_DRAFT_ID, {
      state: createState({
        rows: [{ ...state.rows[1], order: 1 }],
      }),
      updatedAt: 2,
    });
    upsertDraftInYDoc(right, DEFAULT_DRAFT_ID, {
      state: createState({
        rows: [{ ...state.rows[0], fieldType: 'uuid' }, state.rows[1]],
      }),
      updatedAt: 3,
    });

    mergeDocs(left, right);

    expect(readDefaultDraftState(left)?.rows.map((row) => row.fieldName)).toEqual(['email']);
    expect(readDefaultDraftState(right)).toEqual(readDefaultDraftState(left));
  });

  it('merges field reorder with a concurrent field property edit', () => {
    const { left, right } = createSyncedDocs();
    const state = createState();

    upsertDraftInYDoc(left, DEFAULT_DRAFT_ID, {
      state: createState({
        rows: [
          { ...state.rows[1], order: 1 },
          { ...state.rows[0], order: 2 },
        ],
      }),
      updatedAt: 2,
    });
    upsertDraftInYDoc(right, DEFAULT_DRAFT_ID, {
      state: createState({
        rows: [{ ...state.rows[0], fieldComment: '用户 ID' }, state.rows[1]],
      }),
      updatedAt: 3,
    });

    mergeDocs(left, right);

    const rows = readDefaultDraftState(left)?.rows;
    expect(rows?.map((row) => row.fieldName)).toEqual(['email', 'id']);
    expect(rows?.[1]?.fieldComment).toBe('用户 ID');
    expect(readDefaultDraftState(right)).toEqual(readDefaultDraftState(left));
  });

  it('merges index and foreign key edits independently from fields', () => {
    const { left, right } = createSyncedDocs();
    const state = createState();

    upsertDraftInYDoc(left, DEFAULT_DRAFT_ID, {
      state: createState({
        indexes: [
          ...state.indexes,
          {
            id: 'idx_id',
            name: 'idx_users_id',
            fields: [{ name: 'id', direction: 'ASC' }],
            unique: false,
          },
        ],
      }),
      updatedAt: 2,
    });
    upsertDraftInYDoc(right, DEFAULT_DRAFT_ID, {
      state: createState({
        foreignKeys: [
          ...(state.foreignKeys ?? []),
          {
            id: 'fk_user_parent',
            name: 'fk_user_parent',
            fields: ['id'],
            refTable: 'users',
            refFields: ['id'],
          },
        ],
      }),
      updatedAt: 3,
    });

    mergeDocs(left, right);

    expect(readDefaultDraftState(left)?.indexes.map((index) => index.id)).toEqual([
      'idx_email',
      'idx_id',
    ]);
    expect(readDefaultDraftState(left)?.foreignKeys?.map((foreignKey) => foreignKey.id)).toEqual([
      'fk_user_org',
      'fk_user_parent',
    ]);
    expect(readDefaultDraftState(right)).toEqual(readDefaultDraftState(left));
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

  it('converges saved table deletion after a realtime update', () => {
    const seed = new Y.Doc();
    upsertSavedTableInYDoc(seed, {
      normalizedName: 'users',
      name: 'Users',
      state: createState({ tableName: 'users' }),
      createdAt: 1,
      updatedAt: 1,
    });
    const seedUpdate = Y.encodeStateAsUpdate(seed);
    const left = new Y.Doc();
    const right = new Y.Doc();
    Y.applyUpdate(left, seedUpdate);
    Y.applyUpdate(right, seedUpdate);

    upsertSavedTableInYDoc(right, {
      normalizedName: 'users',
      name: 'Users',
      state: createState({
        tableName: 'users',
        rows: [{ ...createState().rows[0], fieldName: 'user_id' }, createState().rows[1]],
      }),
      createdAt: 1,
      updatedAt: 2,
    });
    Y.applyUpdate(left, Y.encodeStateAsUpdate(right));
    deleteSavedTableFromYDoc(left, 'users');
    Y.applyUpdate(right, Y.encodeStateAsUpdate(left));

    expect(getSavedTableFromYDoc(left, 'users')).toBeNull();
    expect(getSavedTableFromYDoc(right, 'users')).toBeNull();
  });

  it('converges saved table field edits with a folder move', () => {
    const { left, right } = createSyncedDocs();
    const state = createState();
    upsertSavedTableInYDoc(left, {
      normalizedName: 'users',
      name: 'Users',
      state,
      folderId: 'folder-a',
      createdAt: 1,
      updatedAt: 1,
    });
    upsertFolderInYDoc(left, { id: 'folder-a', name: 'Core', order: 1, createdAt: 1 });
    upsertFolderInYDoc(left, { id: 'folder-b', name: 'Archive', order: 2, createdAt: 1 });
    Y.applyUpdate(right, Y.encodeStateAsUpdate(left));

    upsertSavedTableInYDoc(left, {
      normalizedName: 'users',
      name: 'Users',
      state: createState({
        rows: [{ ...state.rows[0], fieldName: 'user_id' }, state.rows[1]],
      }),
      folderId: 'folder-a',
      createdAt: 1,
      updatedAt: 2,
    });
    upsertFolderInYDoc(right, {
      id: 'folder-a',
      name: 'Core',
      parentId: 'folder-b',
      order: 1,
      createdAt: 1,
    });

    mergeDocs(left, right);

    expect(getSavedTableFromYDoc(left, 'users')?.state.rows[0].fieldName).toBe('user_id');
    expect(listFoldersFromYDoc(left).find((folder) => folder.id === 'folder-a')?.parentId).toBe(
      'folder-b',
    );
    expect(getSavedTableFromYDoc(right, 'users')).toEqual(getSavedTableFromYDoc(left, 'users'));
    expect(listFoldersFromYDoc(right)).toEqual(listFoldersFromYDoc(left));
  });
});
