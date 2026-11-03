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
  upsertWorkspaceSavedDraft,
  upsertWorkspaceSavedTable,
} from '../workspaceRecords';
import {
  exportWorkspaceYDocToSnapshot,
  mergeWorkspaceSnapshotIntoYDoc,
} from '../workspaceYDocCodec';
import {
  assertWorkspaceYDocStructure,
  ensureWorkspaceYDocMeta,
  getWorkspaceRoot,
  initializeOrMigrateWorkspaceYDoc,
  materializeWorkspaceYDoc,
  trackWorkspaceYDocTableChanges,
  upsertTableRecord,
  WORKSPACE_YDOC_SCHEMA_VERSION,
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
});

describe('workspace YDoc roots', () => {
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

  it('validates only tables changed by an applied update', () => {
    const doc = new Y.Doc();
    ensureWorkspaceYDocMeta(doc);
    const { drafts } = getWorkspaceRoot(doc);

    for (const id of ['stale', 'edited']) {
      upsertTableRecord(drafts, id, toSchemaDocumentState(createState(id)), { updatedAt: 1 });
    }

    // SAFETY: writeTableDoc creates fields as an ordered Y.Map of Y.Map entries.
    const fieldsOf = (target: Y.Doc, id: string) =>
      getWorkspaceRoot(target).drafts.get(id)?.get('fields') as Y.Map<Y.Map<unknown>>;
    fieldsOf(doc, 'stale').get('field-id')?.set('fieldName', 42);
    const remote = new Y.Doc();
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(doc));

    const applyRemote = (fieldName: string | number) => {
      const before = Y.encodeStateVector(remote);
      fieldsOf(remote, 'edited').get('field-id')?.set('fieldName', fieldName);

      return trackWorkspaceYDocTableChanges(doc, () => {
        Y.applyUpdate(doc, Y.encodeStateAsUpdate(remote, before));
      });
    };

    expect(() => assertWorkspaceYDocStructure(doc, applyRemote('renamed'))).not.toThrow();
    expect(() => assertWorkspaceYDocStructure(doc, applyRemote(42))).toThrow(
      'drafts.edited.fields.field-id.fieldName must be a string or null',
    );
  });

  it.each(['drafts'] as const)(
    'loads legacy index kinds in %s without losing index fields',
    (collection) => {
      const cases = [
        { flags: {}, kind: 'index' },
        { flags: { unique: false }, kind: 'index' },
        { flags: { unique: true }, kind: 'unique_index' },
        { flags: { unique: true, isUniqueConstraint: true }, kind: 'unique_constraint' },
        { flags: { unique: true, isPrimary: true }, kind: 'primary' },
      ];

      for (const storage of ['snapshot', 'map']) {
        for (const { flags, kind } of cases) {
          const doc = new Y.Doc();
          ensureWorkspaceYDocMeta(doc);
          const table = setLegacyTableDoc(getWorkspaceRoot(doc)[collection], 'users', 'users');

          const legacyIndex = {
            id: 'index-id',
            name: 'idx_id',
            fields: [{ name: 'id', direction: 'DESC' }],
            ...flags,
          };
          table.set('stateSnapshot', { ...createState('users'), indexes: [legacyIndex] });

          if (storage === 'map') {
            const indexes = new Y.Map<Y.Map<unknown>>();
            table.set('indexes', indexes);
            indexes.set('index-id', new Y.Map(Object.entries(legacyIndex)));
            const order = new Y.Array<string>();
            table.set('indexOrder', order);
            order.push(['index-id']);
          }

          expect(() => initializeOrMigrateWorkspaceYDoc(doc)).not.toThrow();
          expect(tableDocToSchemaDocumentState(table).indexes).toMatchObject([
            { id: 'index-id', name: 'idx_id', fields: legacyIndex.fields, kind },
          ]);
          materializeWorkspaceYDoc(doc);
          expect(() => assertWorkspaceYDocStructure(doc)).not.toThrow();
          const reloaded = new Y.Doc();
          Y.applyUpdate(reloaded, Y.encodeStateAsUpdate(doc));
          expect(() => initializeOrMigrateWorkspaceYDoc(reloaded)).not.toThrow();
          const reloadedTable = getWorkspaceRoot(reloaded)[collection].get('users');

          if (!reloadedTable) throw new Error('Missing reloaded table');
          expect(tableDocToSchemaDocumentState(reloadedTable).indexes[0].kind).toBe(kind);
        }
      }
    },
  );

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
    // SAFETY: the table fixture writes fieldOrder through ensureArray as Y.Array<string>.
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
    // SAFETY: this intentionally invalid value tests rejection of a non-Y.Map draft entry.
    // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- The malformed fixture must cross the Y.Map boundary deliberately.
    getWorkspaceRoot(malformed).drafts.set('broken', 'not-a-map' as unknown as Y.Map<unknown>);

    expect(() => initializeOrMigrateWorkspaceYDoc(malformed)).toThrow(
      'drafts entries must be Y.Maps',
    );
    expect(getWorkspaceRoot(malformed).meta.has('schemaVersion')).toBe(false);
  });
});
