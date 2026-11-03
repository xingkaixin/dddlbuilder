import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  type PersistedState,
  toSchemaDocumentState,
  withDefaultEditorSession,
} from '@ddlbuilder/shared-types';
import {
  exportWorkspaceYDocToSnapshot,
  getDraftRecordFromYDoc,
  importWorkspaceSnapshotToYDoc,
  deleteSavedTableFromYDoc,
  getSavedTableFromYDoc,
  mergeWorkspaceSnapshotIntoYDoc,
  upsertDraftInYDoc,
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
      id: 'field-id',
      fieldName: 'id',
      fieldType: 'bigint',
      fieldComment: '主键',
      nullable: false,
      defaultKind: 'auto_increment',
      defaultValue: '',
      onUpdate: 'none',
    },
    {
      id: 'field-email',
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
  indexes: [
    {
      id: 'idx_email',
      name: 'idx_users_email',
      fields: [{ name: 'email', direction: 'ASC' }],
      kind: 'unique_index',
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

const collaborativeDocumentState = (state: PersistedState) =>
  JSON.parse(JSON.stringify(toSchemaDocumentState(state)));

const collaborativeState = (state: PersistedState): PersistedState =>
  withDefaultEditorSession(collaborativeDocumentState(state));

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
      folders: [{ id: 'folder-1', name: 'Core', order: 1, createdAt: 80, updatedAt: 80 }],
    });

    const exported = exportWorkspaceYDocToSnapshot(doc);

    expect(getDraftRecordFromYDoc(doc, DEFAULT_DRAFT_ID)?.state).toEqual(collaborativeState(state));
    expect(exported.savedTables[0]).toMatchObject({
      normalizedName: 'users',
      name: 'Users',
      folderId: 'folder-1',
      state: collaborativeDocumentState(state),
    });
    expect(exported.savedDrafts[0].state.tableComment).toBe('本地草稿');
    expect(exported.folders).toEqual([
      {
        id: 'folder-1',
        name: 'Core',
        parentId: undefined,
        order: 1,
        createdAt: 80,
        updatedAt: 80,
      },
    ]);
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

  it('keeps field deletion visible when another client edits the deleted field', () => {
    const { left, right } = createSyncedDocs();
    const state = createState();

    upsertDraftInYDoc(left, DEFAULT_DRAFT_ID, {
      state: createState({
        rows: [state.rows[1]],
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
});
