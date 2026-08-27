import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { type PersistedState, toSchemaDocumentState } from '@ddlbuilder/shared-types';
import { tableDocToSchemaDocumentState } from '../workspaceTableDoc';
import {
  deleteWorkspaceSavedTable,
  getWorkspaceSavedDraft,
  getWorkspaceSavedTable,
  listWorkspaceSavedTables,
  renameWorkspaceSavedTable,
  subscribeWorkspaceYDoc,
  upsertWorkspaceSavedDraft,
  upsertWorkspaceSavedTable,
  type WorkspaceYDocChange,
} from '../workspaceRecords';
import {
  exportWorkspaceYDocToSnapshot,
  mergeWorkspaceSnapshotIntoYDoc,
} from '../workspaceYDocCodec';
import {
  ensureWorkspaceYDocMeta,
  getDraftRecordFromYDoc,
  getWorkspaceRoot,
  isWorkspaceYDocEmpty,
  materializeWorkspaceYDoc,
  readFolderRecords,
  upsertTableRecord,
  WORKSPACE_YDOC_SCHEMA_VERSION,
  writeFolderRecord,
} from '../workspaceYDoc';

const createState = (tableName: string): PersistedState => ({
  objectType: 'table',
  schemaName: 'public',
  tableName,
  tableComment: '',
  dbType: 'mysql',
  sqlFormatMode: 'compact',
  viewDefinition: '',
  viewCreateOrReplace: true,
  rows: [
    {
      id: 'field-id',
      fieldName: 'id',
      fieldType: 'bigint',
      fieldComment: '',
      nullable: false,
      defaultKind: 'none',
      defaultValue: '',
      onUpdate: 'none',
    },
  ],
  addCount: 12,
  indexInput: '',
  currentIndexFields: [],
  indexes: [],
  authInput: '',
  authObjects: [],
});

const setLegacyTableDoc = (collection: Y.Map<Y.Map<unknown>>, key: string, tableName: string) => {
  const tableDoc = new Y.Map<unknown>();
  collection.set(key, tableDoc);
  tableDoc.set('stateSnapshot', createState(tableName));
  return tableDoc;
};

describe('saved table identity', () => {
  it('targets tables and drafts by ID after concurrent same-name renames', () => {
    const doc = new Y.Doc();
    const records = ['users', 'orders'].map((name) => ({
      tableId: `table-${name}`,
      normalizedName: name,
      name,
      state: toSchemaDocumentState(createState(name)),
      createdAt: 1,
      updatedAt: 1,
    }));
    for (const record of records) upsertWorkspaceSavedTable(doc, record);
    const peer = new Y.Doc();
    Y.applyUpdate(peer, Y.encodeStateAsUpdate(doc));
    renameWorkspaceSavedTable(doc, 'users', {
      ...records[0],
      normalizedName: 'archive',
      name: 'Archive',
    });
    renameWorkspaceSavedTable(peer, 'orders', {
      ...records[1],
      normalizedName: 'archive',
      name: 'Archive',
    });
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(peer));
    for (const record of records) {
      expect(getWorkspaceSavedTable(doc, record)?.state.tableName).toBe(record.name);
      upsertWorkspaceSavedDraft(doc, {
        ...record,
        normalizedName: 'archive',
        tableName: 'Archive',
        baseSignature: 'base',
      });
      expect(getWorkspaceSavedDraft(doc, record)?.state.tableName).toBe(record.name);
    }
    expect(() => getWorkspaceSavedTable(doc, 'archive')).toThrow('Multiple saved tables');
    expect(() => deleteWorkspaceSavedTable(doc, 'archive')).toThrow('Multiple saved tables');
    deleteWorkspaceSavedTable(doc, records[1]);
    expect(listWorkspaceSavedTables(doc).map((table) => table.tableId)).toEqual([
      records[0].tableId,
    ]);
    doc.destroy();
    peer.destroy();
  });

  it.each(['id-key', 'legacy-key', 'legacy-without-id'])(
    '%s 重命名保留并发字段编辑和草稿',
    (format) => {
      const doc = new Y.Doc();
      const record = {
        tableId: format === 'legacy-without-id' ? 'legacy:users' : 'table-users',
        normalizedName: 'users',
        name: 'Users',
        state: toSchemaDocumentState(createState('users')),
        createdAt: 1,
        updatedAt: 1,
      };
      if (format === 'id-key') upsertWorkspaceSavedTable(doc, record, { forceFineGrained: true });
      else
        upsertTableRecord(
          getWorkspaceRoot(doc).savedTables,
          'users',
          record.state,
          {
            ...(format === 'legacy-key' ? { tableId: record.tableId } : {}),
            normalizedName: 'users',
            name: 'Users',
            createdAt: 1,
            updatedAt: 1,
          },
          { forceFineGrained: true },
        );
      if (format !== 'id-key') {
        upsertTableRecord(
          getWorkspaceRoot(doc).savedDrafts,
          'users',
          record.state,
          {
            normalizedName: 'users',
            tableName: 'Users',
            baseSignature: 'base',
            updatedAt: 1,
          },
          { forceFineGrained: true },
        );
      }
      const originalNode = [...getWorkspaceRoot(doc).savedTables.values()][0];
      const peer = new Y.Doc();
      Y.applyUpdate(peer, Y.encodeStateAsUpdate(doc));
      renameWorkspaceSavedTable(doc, 'users', {
        ...record,
        normalizedName: 'accounts',
        name: 'Accounts',
        updatedAt: 2,
      });
      upsertWorkspaceSavedTable(peer, {
        ...record,
        state: {
          ...record.state,
          rows: record.state.rows.map((row) => ({ ...row, fieldComment: '远端修改' })),
        },
        updatedAt: 3,
      });
      upsertWorkspaceSavedDraft(peer, {
        normalizedName: 'users',
        tableName: 'Users',
        baseSignature: 'base',
        updatedAt: 4,
        state: { ...record.state, tableComment: '远端未保存草稿' },
      });
      const update = Y.encodeStateAsUpdate(doc);
      Y.applyUpdate(doc, Y.encodeStateAsUpdate(peer));
      Y.applyUpdate(peer, update);

      expect([...getWorkspaceRoot(doc).savedTables.values()]).toEqual([originalNode]);
      for (const replica of [doc, peer]) {
        expect(getWorkspaceSavedTable(replica, 'users')).toBeNull();
        expect(getWorkspaceSavedTable(replica, 'accounts')).toMatchObject({
          tableId: record.tableId,
          name: 'Accounts',
          state: { rows: [{ fieldComment: '远端修改' }] },
        });
        expect(getWorkspaceSavedDraft(replica, 'users')).toBeNull();
        expect(getWorkspaceSavedDraft(replica, 'accounts')).toMatchObject({
          normalizedName: 'accounts',
          tableName: 'Accounts',
          state: { tableComment: '远端未保存草稿' },
        });
        expect([...getWorkspaceRoot(replica).savedDrafts.keys()]).toEqual([
          format === 'id-key' ? record.tableId : 'users',
        ]);
        expect(exportWorkspaceYDocToSnapshot(replica).savedDrafts[0].normalizedName).toBe(
          'accounts',
        );
      }
      expect(exportWorkspaceYDocToSnapshot(doc)).toEqual(exportWorkspaceYDocToSnapshot(peer));

      mergeWorkspaceSnapshotIntoYDoc(doc, {
        globalDraft: null,
        drafts: [],
        savedTables: [record],
        savedDrafts: [],
        folders: [],
      });
      expect(listWorkspaceSavedTables(doc).map((table) => table.normalizedName)).toEqual([
        'accounts',
      ]);
      upsertWorkspaceSavedTable(doc, { ...record, tableId: 'new-users' });
      expect(listWorkspaceSavedTables(doc).map((table) => table.tableId)).toEqual([
        record.tableId,
        'new-users',
      ]);
      expect(getWorkspaceSavedDraft(doc, 'users')).toBeNull();
      upsertWorkspaceSavedTable(doc, {
        ...record,
        tableId: 'users',
        normalizedName: 'other',
        name: 'Other',
      });
      expect(getWorkspaceSavedTable(doc, 'accounts')?.tableId).toBe(record.tableId);
      deleteWorkspaceSavedTable(doc, 'accounts');
      expect(listWorkspaceSavedTables(doc).map((table) => table.tableId)).toEqual([
        'new-users',
        'users',
      ]);
    },
  );

  it('重命名只更新名称，并对外通知逻辑名称的变化和删除', () => {
    const doc = new Y.Doc();
    const record = {
      tableId: 'table-users',
      normalizedName: 'users',
      name: 'Users',
      state: toSchemaDocumentState(createState('users')),
      createdAt: 1,
      updatedAt: 1,
    };
    upsertWorkspaceSavedTable(doc, record);
    upsertWorkspaceSavedDraft(doc, {
      normalizedName: 'users',
      tableName: 'Users',
      baseSignature: 'base',
      updatedAt: 1,
      state: record.state,
    });
    const draftNode = [...getWorkspaceRoot(doc).savedDrafts.values()][0];
    upsertWorkspaceSavedTable(doc, {
      ...record,
      state: { ...record.state, tableComment: '新内容' },
    });
    const changes: WorkspaceYDocChange[] = [];
    const unsubscribe = subscribeWorkspaceYDoc(doc, (change) => changes.push(change), [
      'savedTables',
    ]);
    renameWorkspaceSavedTable(doc, 'users', {
      ...record,
      normalizedName: 'accounts',
      name: 'Accounts',
      updatedAt: 2,
    });

    expect(getWorkspaceSavedTable(doc, 'accounts')?.state.tableComment).toBe('新内容');
    expect([...getWorkspaceRoot(doc).savedDrafts.values()]).toEqual([draftNode]);
    expect(changes[0]).toMatchObject({
      entityIds: new Set(['users', 'table-users', 'accounts']),
      renamedTables: [{ previousName: 'users', normalizedName: 'accounts', tableName: 'Accounts' }],
    });
    deleteWorkspaceSavedTable(doc, 'accounts');
    expect(changes.at(-1)?.entityIds).toEqual(new Set(['accounts', 'table-users']));
    unsubscribe();
  });
});

describe('workspace YDoc roots', () => {
  it('writes the schema version only once', () => {
    const doc = new Y.Doc();
    ensureWorkspaceYDocMeta(doc);
    const updates: Uint8Array[] = [];
    doc.on('update', (update: Uint8Array) => updates.push(update));

    ensureWorkspaceYDocMeta(doc);

    expect(getWorkspaceRoot(doc).meta.get('schemaVersion')).toBe(WORKSPACE_YDOC_SCHEMA_VERSION);
    expect(updates).toEqual([]);
  });

  it('reports emptiness across every collection', () => {
    const doc = new Y.Doc();
    expect(isWorkspaceYDocEmpty(doc)).toBe(true);

    writeFolderRecord(doc, {
      id: 'folder-1',
      name: 'Core',
      order: 1,
      createdAt: 5,
      updatedAt: 5,
    });

    expect(isWorkspaceYDocEmpty(doc)).toBe(false);
  });

  it('materializes snapshot-only table docs once', () => {
    const doc = new Y.Doc();
    const { drafts, savedTables, savedDrafts } = getWorkspaceRoot(doc);
    setLegacyTableDoc(drafts, 'draft-1', 'draft');
    setLegacyTableDoc(savedTables, 'users', 'users');
    const savedDraft = setLegacyTableDoc(savedDrafts, 'users', 'users_draft');

    expect(materializeWorkspaceYDoc(doc)).toBe(true);
    expect(savedDraft.get('fieldOrder')).toBeInstanceOf(Y.Array);
    expect(materializeWorkspaceYDoc(doc)).toBe(false);
    expect(tableDocToSchemaDocumentState(savedDraft)).toEqual(
      toSchemaDocumentState(createState('users_draft')),
    );
  });

  it('reads draft metadata with fallbacks and reports missing drafts', () => {
    const doc = new Y.Doc();
    const { drafts } = getWorkspaceRoot(doc);
    upsertTableRecord(drafts, 'draft-1', createState('draft'), { folderId: 'folder-1' });
    upsertTableRecord(drafts, 'draft-2', createState('draft'), {
      createdAt: 1,
      updatedAt: 2,
      folderId: 3,
    });

    expect(getDraftRecordFromYDoc(doc, 'missing')).toBeNull();
    expect(getDraftRecordFromYDoc(doc, 'draft-1')).toMatchObject({
      createdAt: undefined,
      folderId: 'folder-1',
    });
    expect(getDraftRecordFromYDoc(doc, 'draft-1')?.updatedAt).toBe(0);
    expect(getDraftRecordFromYDoc(doc, 'draft-2')).toMatchObject({ createdAt: 1, updatedAt: 2 });
    expect(getDraftRecordFromYDoc(doc, 'draft-2')).not.toHaveProperty('folderId');
  });

  it('normalizes folder records and skips malformed ones', () => {
    const doc = new Y.Doc();
    const { folders } = getWorkspaceRoot(doc);
    writeFolderRecord(doc, {
      id: 'child',
      name: 'Child',
      parentId: 'root',
      order: 2,
      createdAt: 7,
      updatedAt: 7,
    });
    writeFolderRecord(doc, {
      id: 'root',
      name: 'Root',
      order: 1,
      createdAt: 6,
      updatedAt: 6,
    });
    const malformed = new Y.Map<unknown>();
    malformed.set('name', 1);
    folders.set('broken', malformed);
    const partial = new Y.Map<unknown>();
    partial.set('name', 'Partial');
    folders.set('partial', partial);

    const records = readFolderRecords(doc);

    expect(records.map((folder) => folder.id)).toEqual(['partial', 'root', 'child']);
    expect(records[1]).toEqual({
      id: 'root',
      name: 'Root',
      parentId: undefined,
      order: 1,
      createdAt: 6,
      updatedAt: 6,
    });
    expect(Object.keys(records[1]).sort()).toEqual([
      'createdAt',
      'id',
      'name',
      'order',
      'parentId',
      'updatedAt',
    ]);
    expect(records[2].parentId).toBe('root');
    expect(records[0]).toMatchObject({ id: 'partial', name: 'Partial', order: 0 });
    expect(records[0].createdAt).toBe(0);
    expect(records[0].updatedAt).toBe(0);
  });
});
