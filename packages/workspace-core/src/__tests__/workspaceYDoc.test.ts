import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { type PersistedState, toSchemaDocumentState } from '@ddlbuilder/shared-types';
import { tableDocToSchemaDocumentState } from '../workspaceTableDoc';
import {
  deleteWorkspaceSavedTable,
  getWorkspaceSavedDraft,
  getWorkspaceSavedTable,
  listWorkspaceSavedTables,
  recreateWorkspaceSavedTable,
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
  assertWorkspaceYDocStructure,
  ensureWorkspaceYDocMeta,
  getDraftRecordFromYDoc,
  getWorkspaceRoot,
  initializeOrMigrateWorkspaceYDoc,
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
  it('does not attach another legacy table draft when names collide', () => {
    const doc = new Y.Doc();
    const { savedTables, savedDrafts } = getWorkspaceRoot(doc);
    for (const key of ['first', 'second']) {
      upsertTableRecord(savedTables, key, toSchemaDocumentState(createState(key)), {
        tableId: `table-${key}`,
        normalizedName: 'shared',
        name: 'Shared',
        updatedAt: 1,
      });
    }
    upsertTableRecord(savedDrafts, 'first', toSchemaDocumentState(createState('first-draft')), {
      normalizedName: 'shared',
      tableName: 'Shared',
      updatedAt: 2,
    });
    const target = { tableId: 'table-second', normalizedName: 'shared' };
    expect(getWorkspaceSavedDraft(doc, target)).toBeNull();
    const saved = getWorkspaceSavedTable(doc, target);
    if (!saved) throw new Error('Missing fixture table');
    renameWorkspaceSavedTable(doc, 'shared', {
      ...saved,
      normalizedName: 'renamed',
      name: 'Renamed',
    });
    expect(
      getWorkspaceSavedDraft(doc, { tableId: 'table-first', normalizedName: 'shared' })?.state
        .tableName,
    ).toBe('first-draft');
  });

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

  it('重新激活记录不会被过期副本上的并发父节点删除吞掉', () => {
    const deleting = new Y.Doc();
    const stale = new Y.Doc();
    const record = {
      tableId: 'table-users',
      normalizedName: 'users',
      name: 'Users',
      state: toSchemaDocumentState(createState('users')),
      createdAt: 1,
      updatedAt: 1,
    };
    upsertWorkspaceSavedTable(deleting, record);
    Y.applyUpdate(stale, Y.encodeStateAsUpdate(deleting));

    deleteWorkspaceSavedTable(deleting, record);
    recreateWorkspaceSavedTable(stale, {
      ...record,
      state: { ...record.state, tableComment: 'restored' },
      updatedAt: 2,
    });
    const deletionUpdate = Y.encodeStateAsUpdate(deleting);
    const recreationUpdate = Y.encodeStateAsUpdate(stale);
    Y.applyUpdate(deleting, recreationUpdate);
    Y.applyUpdate(stale, deletionUpdate);

    for (const replica of [deleting, stale]) {
      expect(getWorkspaceSavedTable(replica, record)?.state.tableComment).toBe('restored');
    }
    deleting.destroy();
    stale.destroy();
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

  it('rejects missing and future schema versions without rewriting them', () => {
    const missing = new Y.Doc();
    ensureWorkspaceYDocMeta(missing);
    getWorkspaceRoot(missing).meta.delete('schemaVersion');

    expect(() => assertWorkspaceYDocStructure(missing)).toThrow(
      'Unsupported workspace schema version: undefined',
    );

    const future = new Y.Doc();
    getWorkspaceRoot(future).meta.set('schemaVersion', WORKSPACE_YDOC_SCHEMA_VERSION + 1);

    expect(() => ensureWorkspaceYDocMeta(future)).toThrow(
      'Unsupported workspace schema version: 2',
    );
    expect(() => initializeOrMigrateWorkspaceYDoc(future)).toThrow(
      'Unsupported workspace schema version: 2',
    );
    expect(getWorkspaceRoot(future).meta.get('schemaVersion')).toBe(
      WORKSPACE_YDOC_SCHEMA_VERSION + 1,
    );

    const invalid = new Y.Doc();
    getWorkspaceRoot(invalid).meta.set('schemaVersion', null);
    expect(() => ensureWorkspaceYDocMeta(invalid)).toThrow(
      'Unsupported workspace schema version: null',
    );
    expect(getWorkspaceRoot(invalid).meta.get('schemaVersion')).toBeNull();
  });

  it('does not initialize an existing document without a schema version', () => {
    const doc = new Y.Doc();
    getWorkspaceRoot(doc).drafts.set('broken', new Y.Map());

    expect(() => ensureWorkspaceYDocMeta(doc)).toThrow(
      'Unsupported workspace schema version: undefined',
    );
    expect(getWorkspaceRoot(doc).meta.has('schemaVersion')).toBe(false);
  });

  it('rejects records that cannot be decoded into a complete workspace snapshot', () => {
    const missingIndexFields = new Y.Doc();
    ensureWorkspaceYDocMeta(missingIndexFields);
    upsertTableRecord(
      getWorkspaceRoot(missingIndexFields).drafts,
      'draft',
      toSchemaDocumentState({
        ...createState('users'),
        indexes: [
          {
            id: 'index-id',
            name: 'idx_id',
            kind: 'index',
            fields: [{ name: 'id', direction: 'ASC' }],
          },
        ],
      }),
      { updatedAt: 1 },
    );
    const indexTable = getWorkspaceRoot(missingIndexFields).drafts.get('draft');
    if (!indexTable) throw new Error('Missing test table');
    const index = (indexTable.get('indexes') as Y.Map<Y.Map<unknown>>).get('index-id');
    index?.delete('fields');

    expect(() => assertWorkspaceYDocStructure(missingIndexFields)).toThrow(
      'drafts.draft.indexes.index-id.fields must be an array',
    );

    const invalidFieldType = new Y.Doc();
    ensureWorkspaceYDocMeta(invalidFieldType);
    upsertTableRecord(
      getWorkspaceRoot(invalidFieldType).drafts,
      'draft',
      toSchemaDocumentState(createState('users')),
      { updatedAt: 1 },
    );
    const fieldTable = getWorkspaceRoot(invalidFieldType).drafts.get('draft');
    if (!fieldTable) throw new Error('Missing test table');
    const field = (fieldTable.get('fields') as Y.Map<Y.Map<unknown>>).get('field-id');
    field?.set('fieldName', 42);

    expect(() => assertWorkspaceYDocStructure(invalidFieldType)).toThrow(
      'drafts.draft.fields.field-id.fieldName must be a string or null',
    );
  });

  it('accepts duplicate order entries produced by concurrent Yjs reordering', () => {
    const doc = new Y.Doc();
    ensureWorkspaceYDocMeta(doc);
    upsertTableRecord(
      getWorkspaceRoot(doc).drafts,
      'draft',
      toSchemaDocumentState({
        ...createState('users'),
        rows: ['a', 'b', 'c', 'd'].map((fieldName) => ({
          ...createState('users').rows[0],
          id: `field-${fieldName}`,
          fieldName,
        })),
      }),
      { updatedAt: 1 },
    );
    const tableDoc = getWorkspaceRoot(doc).drafts.get('draft');
    if (!tableDoc) throw new Error('Missing test table');
    const order = tableDoc.get('fieldOrder') as Y.Array<string>;
    order.delete(0, order.length);
    order.push(['field-a', 'field-d', 'field-c', 'field-c', 'field-b']);

    expect(() => assertWorkspaceYDocStructure(doc)).not.toThrow();
    expect(exportWorkspaceYDocToSnapshot(doc).drafts[0].state.rows.map((row) => row.id)).toEqual([
      'field-a',
      'field-d',
      'field-c',
      'field-b',
    ]);
  });

  it('migrates only structurally valid versionless documents', () => {
    const legacy = new Y.Doc();
    setLegacyTableDoc(getWorkspaceRoot(legacy).drafts, 'legacy', 'users');

    initializeOrMigrateWorkspaceYDoc(legacy);

    expect(getWorkspaceRoot(legacy).meta.get('schemaVersion')).toBe(WORKSPACE_YDOC_SCHEMA_VERSION);
    expect(() => assertWorkspaceYDocStructure(legacy)).not.toThrow();

    const malformed = new Y.Doc();
    getWorkspaceRoot(malformed).drafts.set('broken', 'not-a-map' as unknown as Y.Map<unknown>);

    expect(() => initializeOrMigrateWorkspaceYDoc(malformed)).toThrow(
      'drafts entries must be Y.Maps',
    );
    expect(getWorkspaceRoot(malformed).meta.has('schemaVersion')).toBe(false);
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
