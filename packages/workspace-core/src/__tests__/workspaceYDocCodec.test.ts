import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { type PersistedState, toSchemaDocumentState } from '@ddlbuilder/shared-types';
import type { WorkspaceSnapshot } from '@ddlbuilder/shared-types/workspace';
import {
  createWorkspaceYDocUpdateFromSnapshot,
  exportWorkspaceYDocToSnapshot,
  importWorkspaceSnapshotToYDoc,
  isWorkspaceYDocInitialized,
  mergeWorkspaceSnapshotIntoYDoc,
} from '../workspaceYDocCodec';

const createState = (tableName: string): PersistedState => ({
  schemaName: 'public',
  objectType: 'table',
  tableName,
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
  indexInput: 'email',
  currentIndexFields: [{ name: 'email', direction: 'ASC' }],
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
});

const createSnapshot = (): WorkspaceSnapshot => ({
  globalDraft: { state: createState('global'), updatedAt: 8 },
  drafts: [
    {
      draftId: 'draft-1',
      state: createState('draft_users'),
      createdAt: 10,
      updatedAt: 20,
      folderId: 'folder-1',
      trashedAt: 21,
    },
  ],
  savedTables: [
    {
      tableId: 'table-users',
      normalizedName: 'users',
      name: 'Users',
      state: createState('users'),
      createdAt: 30,
      updatedAt: 40,
      folderId: 'folder-1',
      trashedAt: 41,
    },
  ],
  savedDrafts: [
    {
      normalizedName: 'users',
      tableName: 'Users',
      state: createState('users_draft'),
      updatedAt: 50,
      baseSignature: 'base',
    },
  ],
  folders: [{ id: 'folder-1', name: 'Core', order: 1, createdAt: 5, updatedAt: 5 }],
});

const collaborativeState = (state: PersistedState) => toSchemaDocumentState(state);

describe('workspace YDoc codec', () => {
  it('round-trips every workspace collection', () => {
    const doc = new Y.Doc();
    importWorkspaceSnapshotToYDoc(doc, createSnapshot());

    expect(isWorkspaceYDocInitialized(doc)).toBe(true);
    const expected = {
      ...createSnapshot(),
      globalDraft: null,
      drafts: [
        {
          draftId: 'default',
          state: createState('global'),
          createdAt: undefined,
          updatedAt: 8,
          folderId: undefined,
        },
        ...createSnapshot().drafts,
      ],
    };
    expected.drafts = expected.drafts.map((record) => ({
      ...record,
      state: collaborativeState(record.state),
    }));
    expected.savedTables = expected.savedTables.map((record) => ({
      ...record,
      state: collaborativeState(record.state),
    }));
    expected.savedDrafts = expected.savedDrafts.map((record) => ({
      ...record,
      tableId: 'table-users',
      state: collaborativeState(record.state),
    }));

    expect(JSON.parse(JSON.stringify(exportWorkspaceYDocToSnapshot(doc)))).toEqual(
      JSON.parse(JSON.stringify(expected)),
    );
  });

  it('keeps the newest default draft when legacy and canonical records conflict', () => {
    const legacyIsNewer = createSnapshot();
    legacyIsNewer.globalDraft = { state: createState('new_legacy'), updatedAt: 100 };
    legacyIsNewer.drafts.unshift({
      draftId: 'default',
      state: createState('stale_canonical'),
      updatedAt: 1,
    });
    const firstDoc = new Y.Doc();
    importWorkspaceSnapshotToYDoc(firstDoc, legacyIsNewer);
    expect(
      exportWorkspaceYDocToSnapshot(firstDoc).drafts.find((draft) => draft.draftId === 'default')
        ?.state.tableName,
    ).toBe('new_legacy');

    const canonicalIsNewer = createSnapshot();
    canonicalIsNewer.globalDraft = { state: createState('stale_legacy'), updatedAt: 1 };
    canonicalIsNewer.drafts.unshift({
      draftId: 'default',
      state: createState('new_canonical'),
      updatedAt: 100,
    });
    const secondDoc = new Y.Doc();
    importWorkspaceSnapshotToYDoc(secondDoc, canonicalIsNewer);
    expect(
      exportWorkspaceYDocToSnapshot(secondDoc).drafts.find((draft) => draft.draftId === 'default')
        ?.state.tableName,
    ).toBe('new_canonical');
  });

  it('encodes a transport update and preserves authoritative empty collections', () => {
    const doc = new Y.Doc();
    Y.applyUpdate(
      doc,
      createWorkspaceYDocUpdateFromSnapshot({
        globalDraft: null,
        drafts: [],
        savedTables: [],
        savedDrafts: [],
        folders: [],
      }),
    );

    expect(isWorkspaceYDocInitialized(doc)).toBe(true);
    expect(exportWorkspaceYDocToSnapshot(doc)).toEqual({
      globalDraft: null,
      drafts: [],
      savedTables: [],
      savedDrafts: [],
      folders: [],
    });
  });

  it('reuses field identities while replacing removed ordered entities', () => {
    const doc = new Y.Doc();
    importWorkspaceSnapshotToYDoc(doc, createSnapshot());
    const draft = doc.getMap<Y.Map<unknown>>('drafts').get('draft-1');
    expect(draft).toBeInstanceOf(Y.Map);
    const firstOrder = ((draft as Y.Map<unknown>).get('fieldOrder') as Y.Array<string>).toArray();
    const updated = createSnapshot();
    updated.drafts[0] = {
      ...updated.drafts[0],
      state: {
        ...createState('renamed'),
        rows: [createState('renamed').rows[1], createState('renamed').rows[0]],
        indexes: [],
        foreignKeys: [],
      },
      updatedAt: 21,
    };

    importWorkspaceSnapshotToYDoc(doc, updated);

    const nextDraft = doc.getMap<Y.Map<unknown>>('drafts').get('draft-1');
    expect(nextDraft).toBeInstanceOf(Y.Map);
    expect(((nextDraft as Y.Map<unknown>).get('fieldOrder') as Y.Array<string>).toArray()).toEqual([
      firstOrder[1],
      firstOrder[0],
    ]);
    const exported = exportWorkspaceYDocToSnapshot(doc).drafts[1]?.state;
    expect(exported).toMatchObject({ tableName: 'renamed', indexes: [] });
    expect(exported).not.toHaveProperty('foreignKeys');
  });

  it('reads legacy snapshots and falls back to them for malformed fine-grained values', () => {
    const doc = new Y.Doc();
    const legacy = new Y.Map<unknown>();
    const snapshot = createState('legacy');
    snapshot.rows[0].id = 'field-1';
    legacy.set('stateSnapshot', snapshot);
    legacy.set('metadata', new Y.Map());
    doc.getMap<Y.Map<unknown>>('drafts').set('legacy', legacy);

    expect(exportWorkspaceYDocToSnapshot(doc).drafts[0]?.state.tableName).toBe('legacy');

    const scalar = new Y.Map<unknown>();
    scalar.set('objectType', 'invalid');
    scalar.set('dbType', 1);
    const fields = new Y.Map<Y.Map<unknown>>();
    const field = new Y.Map<unknown>();
    field.set('fieldName', 1);
    field.set('nullable', 1);
    fields.set('field-1', field);
    legacy.set('scalar', scalar);
    legacy.set('fields', fields);
    const order = new Y.Array<string>();
    order.insert(0, ['field-1', 'missing']);
    legacy.set('fieldOrder', order);

    expect(exportWorkspaceYDocToSnapshot(doc).drafts[0]?.state).toMatchObject({
      objectType: 'table',
      schemaName: 'public',
      tableName: 'legacy',
      dbType: 'mysql',
      rows: [
        {
          id: 'field-1',
          fieldName: 'id',
          nullable: false,
        },
      ],
    });
  });

  it('exports missing timestamps deterministically', () => {
    const doc = new Y.Doc();
    const tableDoc = new Y.Map<unknown>();
    tableDoc.set('stateSnapshot', createState('legacy'));
    tableDoc.set('metadata', new Y.Map());
    doc.getMap<Y.Map<unknown>>('savedTables').set('legacy', tableDoc);

    const first = exportWorkspaceYDocToSnapshot(doc);
    const second = exportWorkspaceYDocToSnapshot(doc);

    expect(second).toEqual(first);
    expect(first.savedTables[0]).toMatchObject({ createdAt: 0, updatedAt: 0 });
  });

  it('keeps newer document records when merging a snapshot', () => {
    const doc = new Y.Doc();
    const current = createSnapshot();
    current.drafts[0] = { ...current.drafts[0], updatedAt: 100 };
    importWorkspaceSnapshotToYDoc(doc, current);
    const incoming = createSnapshot();
    incoming.drafts[0] = {
      ...incoming.drafts[0],
      state: createState('stale'),
      updatedAt: 99,
    };
    incoming.savedTables[0] = {
      ...incoming.savedTables[0],
      state: createState('newer'),
      updatedAt: 41,
    };

    mergeWorkspaceSnapshotIntoYDoc(doc, incoming);

    const exported = exportWorkspaceYDocToSnapshot(doc);
    expect(exported.drafts.find(({ draftId }) => draftId === 'draft-1')?.state.tableName).toBe(
      'draft_users',
    );
    expect(exported.savedTables[0]?.state.tableName).toBe('newer');
  });

  it('merges folder changes by modification time', () => {
    const doc = new Y.Doc();
    const current = createSnapshot();
    current.folders[0] = { ...current.folders[0], name: 'Current', updatedAt: 20 };
    importWorkspaceSnapshotToYDoc(doc, current);

    const stale = createSnapshot();
    stale.folders[0] = { ...stale.folders[0], name: 'Stale', updatedAt: 19 };
    mergeWorkspaceSnapshotIntoYDoc(doc, stale);
    expect(exportWorkspaceYDocToSnapshot(doc).folders[0]?.name).toBe('Current');

    const newer = createSnapshot();
    newer.folders[0] = { ...newer.folders[0], name: 'Newer', updatedAt: 21 };
    mergeWorkspaceSnapshotIntoYDoc(doc, newer);
    expect(exportWorkspaceYDocToSnapshot(doc).folders[0]?.name).toBe('Newer');
  });

  it('falls back to defaults for saved entries without metadata', () => {
    const doc = new Y.Doc();
    const snapshot = createSnapshot();
    snapshot.savedTables[0] = { ...snapshot.savedTables[0], createdAt: undefined };
    importWorkspaceSnapshotToYDoc(doc, snapshot);
    const bare = new Y.Map<unknown>();
    bare.set('stateSnapshot', createState('bare'));
    doc.getMap<Y.Map<unknown>>('savedTables').set('bare', bare);
    doc.getMap<Y.Map<unknown>>('savedDrafts').set('bare', bare.clone());

    const exported = exportWorkspaceYDocToSnapshot(doc);

    expect(exported.savedTables[0]).toMatchObject({ createdAt: 40, updatedAt: 40 });
    const bareTable = exported.savedTables.find((table) => table.normalizedName === 'bare');
    expect(bareTable).toMatchObject({ name: 'bare' });
    expect(bareTable?.createdAt).toBe(bareTable?.updatedAt);
    expect(exported.savedDrafts.find((draft) => draft.normalizedName === 'bare')).toMatchObject({
      tableName: 'bare',
      baseSignature: '',
    });
  });

  it('reports an untouched document as uninitialized', () => {
    expect(isWorkspaceYDocInitialized(new Y.Doc())).toBe(false);
  });

  it('exports without emitting document updates', () => {
    const empty = new Y.Doc();
    const emptyBefore = Y.encodeStateAsUpdate(empty);
    exportWorkspaceYDocToSnapshot(empty);
    expect(Y.encodeStateAsUpdate(empty)).toEqual(emptyBefore);

    const doc = new Y.Doc();
    importWorkspaceSnapshotToYDoc(doc, createSnapshot());
    const legacy = new Y.Map<unknown>();
    legacy.set('stateSnapshot', createState('legacy'));
    doc.getMap<Y.Map<unknown>>('savedDrafts').set('legacy', legacy);
    const updates: Uint8Array[] = [];
    doc.on('update', (update: Uint8Array) => updates.push(update));

    const before = Y.encodeStateAsUpdate(doc);
    exportWorkspaceYDocToSnapshot(doc);

    expect(updates).toEqual([]);
    expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
  });
});
