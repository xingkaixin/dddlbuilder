import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { toEditorSessionState, type PersistedState } from '@ddlbuilder/shared-types';
import {
  buildFolderTreeFromYDoc,
  deleteFolderFromYDoc,
  deleteSavedDraftFromYDoc,
  getSavedDraftFromYDoc,
  getSavedTableFromYDoc,
  getStateForWorkspaceSource,
  getWorkspaceSnapshotFromYDoc,
  isWorkspaceYDocEmpty,
  listDraftRecordsFromYDoc,
  listFoldersFromYDoc,
  listSavedDraftsFromYDoc,
  listSavedTableMetadataFromYDoc,
  mergeWorkspaceSnapshotIntoYDoc,
  upsertDraftInYDoc,
  upsertFolderInYDoc,
  upsertSavedDraftInYDoc,
  upsertSavedTableInYDoc,
} from '@/services/workspaceYDocAdapter';
import { serializePersistedStateForComparison } from '@/utils/persistedStateSignature';
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
      defaultKind: 'none',
      defaultValue: '',
      onUpdate: 'none',
    },
    {
      order: 2,
      fieldName: '  ',
      fieldType: 'varchar(64)',
      fieldComment: '',
      nullable: true,
      defaultKind: 'none',
      defaultValue: '',
      onUpdate: 'none',
    },
  ],
  addCount: 12,
  indexes: [],
  authInput: '',
  authObjects: [],
  ...overrides,
});

const createSavedTable = (overrides: Partial<PersistedState> = {}) => ({
  normalizedName: 'users',
  name: 'Users',
  state: createState(overrides),
  createdAt: 10,
  updatedAt: 20,
  folderId: 'folder-1',
});

describe('workspaceYDocAdapter records', () => {
  it('uses only identity fields from a saved-table target when writing its draft', () => {
    const doc = new Y.Doc();
    const table = { ...createSavedTable(), tableId: 'table-users' };
    upsertSavedTableInYDoc(doc, table);
    upsertSavedDraftInYDoc(doc, table, {
      tableName: table.name,
      state: createState({ tableComment: 'unsaved' }),
      baseSignature: 'base',
      updatedAt: 30,
    });
    expect(getSavedDraftFromYDoc(doc, table)?.state.tableComment).toBe('unsaved');
    doc.destroy();
  });

  it('reads saved tables with metadata fallbacks', () => {
    const doc = new Y.Doc();
    upsertSavedTableInYDoc(doc, createSavedTable());
    const bare = new Y.Map<unknown>();
    bare.set('stateSnapshot', createState({ tableName: 'bare' }));
    doc.getMap<Y.Map<unknown>>('savedTables').set('bare', bare);

    expect(getSavedTableFromYDoc(doc, 'missing')).toBeNull();
    expect(getSavedTableFromYDoc(doc, 'users')).toMatchObject({
      name: 'Users',
      createdAt: 10,
      updatedAt: 20,
      folderId: 'folder-1',
    });

    const bareRecord = getSavedTableFromYDoc(doc, 'bare');
    expect(bareRecord).toMatchObject({ name: 'bare' });
    expect(bareRecord).not.toHaveProperty('folderId');
    expect(bareRecord?.createdAt).toBe(bareRecord?.updatedAt);

    expect(listSavedTableMetadataFromYDoc(doc)).toEqual([
      {
        tableId: 'legacy:users',
        normalizedName: 'users',
        name: 'Users',
        dbType: 'mysql',
        fieldCount: 1,
        folderId: 'folder-1',
        trashedAt: undefined,
        createdAt: 10,
        updatedAt: 20,
      },
      expect.objectContaining({ normalizedName: 'bare', folderId: undefined }),
    ]);
  });

  it('reads and deletes saved drafts with metadata fallbacks', () => {
    const doc = new Y.Doc();
    upsertSavedDraftInYDoc(doc, 'users', {
      state: createState(),
      tableName: 'Users',
      baseSignature: 'base',
      updatedAt: 30,
    });
    const bare = new Y.Map<unknown>();
    bare.set('stateSnapshot', createState());
    doc.getMap<Y.Map<unknown>>('savedDrafts').set('bare', bare);

    expect(getSavedDraftFromYDoc(doc, 'missing')).toBeNull();
    expect(getSavedDraftFromYDoc(doc, 'users')).toMatchObject({
      tableName: 'Users',
      baseSignature: 'base',
      updatedAt: 30,
    });
    expect(getSavedDraftFromYDoc(doc, 'bare')).toMatchObject({
      tableName: 'bare',
      baseSignature: '',
    });
    expect(Array.from(listSavedDraftsFromYDoc(doc).keys())).toEqual(['users', 'bare']);

    deleteSavedDraftFromYDoc(doc, 'users');

    expect(getSavedDraftFromYDoc(doc, 'users')).toBeNull();
  });

  it('lists draft records with their metadata', () => {
    const doc = new Y.Doc();
    upsertDraftInYDoc(doc, DEFAULT_DRAFT_ID, { state: createState(), updatedAt: 5 });
    upsertDraftInYDoc(doc, 'draft-2', {
      state: createState({ tableName: 'orders' }),
      createdAt: 1,
      updatedAt: 6,
      folderId: 'folder-1',
    });

    expect(listDraftRecordsFromYDoc(doc)).toMatchObject([
      { draftId: DEFAULT_DRAFT_ID, record: { updatedAt: 5 } },
      { draftId: 'draft-2', record: { createdAt: 1, updatedAt: 6, folderId: 'folder-1' } },
    ]);
  });

  it('resolves state for both workspace sources', () => {
    const doc = new Y.Doc();
    upsertDraftInYDoc(doc, DEFAULT_DRAFT_ID, { state: createState(), updatedAt: 1 });
    upsertSavedTableInYDoc(doc, createSavedTable({ tableName: 'saved_users' }));

    expect(
      getStateForWorkspaceSource(doc, { kind: 'draft', draftId: DEFAULT_DRAFT_ID })?.tableName,
    ).toBe('users');
    expect(
      getStateForWorkspaceSource(doc, { kind: 'saved', normalizedName: 'users' })?.tableName,
    ).toBe('saved_users');
    expect(getStateForWorkspaceSource(doc, { kind: 'draft', draftId: 'missing' })).toBeNull();
    expect(
      getStateForWorkspaceSource(doc, { kind: 'saved', normalizedName: 'missing' }),
    ).toBeNull();
  });

  it('激活保存表时合并远端更新且保留未保存草稿', () => {
    const doc = new Y.Doc();
    const draftState = createState({ tableName: 'local_edit' });
    upsertSavedTableInYDoc(doc, createSavedTable({ tableName: 'saved_users' }));
    const savedRecord = getSavedTableFromYDoc(doc, 'users');
    expect(savedRecord).not.toBeNull();
    if (!savedRecord) throw new Error('saved table fixture missing');
    const savedBaseSignature = serializePersistedStateForComparison(savedRecord.state);
    upsertSavedDraftInYDoc(doc, 'users', {
      state: draftState,
      tableName: 'Users',
      baseSignature: savedBaseSignature,
      updatedAt: 30,
    });
    const source = {
      kind: 'saved_table' as const,
      normalizedName: 'users',
      tableName: 'Users',
      baseSignature: '',
    };

    const editorSession = toEditorSessionState(createState());
    expect(getWorkspaceSnapshotFromYDoc(doc, source, editorSession)?.state.tableName).toBe(
      'local_edit',
    );

    upsertSavedTableInYDoc(doc, createSavedTable({ tableName: 'remote_update' }));

    const refreshed = getWorkspaceSnapshotFromYDoc(doc, source, editorSession);
    const remoteRecord = getSavedTableFromYDoc(doc, 'users');
    expect(remoteRecord).not.toBeNull();
    if (!remoteRecord) throw new Error('remote saved table fixture missing');
    expect(refreshed?.state.tableName).toBe('local_edit');
    expect(refreshed?.source).toMatchObject({
      kind: 'saved_table',
      normalizedName: 'users',
      baseSignature: serializePersistedStateForComparison(remoteRecord.state),
    });
  });

  it('builds a folder tree and drops deleted folders', () => {
    const doc = new Y.Doc();
    expect(isWorkspaceYDocEmpty(doc)).toBe(true);

    upsertFolderInYDoc(doc, { id: 'root', name: 'Root', order: 2, createdAt: 1 });
    upsertFolderInYDoc(doc, { id: 'first', name: 'First', order: 1, createdAt: 2 });
    upsertFolderInYDoc(doc, {
      id: 'child',
      name: 'Child',
      parentId: 'root',
      order: 1,
      createdAt: 3,
    });
    upsertFolderInYDoc(doc, {
      id: 'orphan',
      name: 'Orphan',
      parentId: 'missing',
      order: 3,
      createdAt: 4,
    });

    expect(isWorkspaceYDocEmpty(doc)).toBe(false);
    expect(listFoldersFromYDoc(doc).map((folder) => folder.id)).toEqual([
      'first',
      'child',
      'root',
      'orphan',
    ]);
    expect(
      buildFolderTreeFromYDoc(doc).map((node) => [node.id, node.children.map((child) => child.id)]),
    ).toEqual([
      ['first', []],
      ['root', ['child']],
      ['orphan', []],
    ]);

    deleteFolderFromYDoc(doc, 'child');

    expect(listFoldersFromYDoc(doc).map((folder) => folder.id)).toEqual([
      'first',
      'root',
      'orphan',
    ]);
  });

  it('skips snapshot records that are older than the document', () => {
    const doc = new Y.Doc();
    upsertDraftInYDoc(doc, DEFAULT_DRAFT_ID, { state: createState(), updatedAt: 10 });
    upsertSavedTableInYDoc(doc, createSavedTable());
    upsertSavedDraftInYDoc(doc, 'users', {
      state: createState(),
      tableName: 'Users',
      baseSignature: 'base',
      updatedAt: 20,
    });
    upsertFolderInYDoc(doc, { id: 'folder-1', name: 'Core', order: 1, createdAt: 1 });

    mergeWorkspaceSnapshotIntoYDoc(doc, {
      globalDraft: { state: createState({ tableName: 'stale' }), updatedAt: 1 },
      drafts: [],
      savedTables: [{ ...createSavedTable({ tableName: 'stale' }), updatedAt: 1 }],
      savedDrafts: [
        {
          normalizedName: 'users',
          tableName: 'Users',
          state: createState({ tableName: 'stale' }),
          baseSignature: 'base',
          updatedAt: 1,
        },
      ],
      folders: [{ id: 'folder-1', name: 'Renamed', order: 9, createdAt: 1, updatedAt: 1 }],
    });

    expect(
      getStateForWorkspaceSource(doc, { kind: 'draft', draftId: DEFAULT_DRAFT_ID })?.tableName,
    ).toBe('users');
    expect(getSavedTableFromYDoc(doc, 'users')?.state.tableName).toBe('users');
    expect(getSavedDraftFromYDoc(doc, 'users')?.state.tableName).toBe('users');
    expect(listFoldersFromYDoc(doc)[0]).toMatchObject({ name: 'Core', order: 1 });
  });
});
