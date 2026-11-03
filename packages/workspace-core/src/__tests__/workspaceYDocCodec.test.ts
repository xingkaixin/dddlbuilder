import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  type PersistedState,
  type SchemaDocumentState,
  toSchemaDocumentState,
} from '@ddlbuilder/shared-types';
import type { WorkspaceSnapshot } from '@ddlbuilder/shared-types/workspace';
import {
  exportWorkspaceYDocToSnapshot,
  importWorkspaceSnapshotToYDoc,
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

const collaborativeState = (state: SchemaDocumentState) => toSchemaDocumentState(state);

describe('workspace YDoc codec', () => {
  it('round-trips every workspace collection', () => {
    const doc = new Y.Doc();
    importWorkspaceSnapshotToYDoc(doc, createSnapshot());

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
});

it('retains logical relationships and standard references across workspace transport', () => {
  const snapshot = createSnapshot();
  const state = snapshot.drafts[0].state;
  state.rows[0].standardId = 'business-id';
  state.foreignKeys = [
    {
      id: 'logical',
      name: 'owner',
      fields: ['id'],
      refTable: 'users',
      refFields: ['id'],
      logical: {
        cardinality: 'one-to-one',
        optionality: 'optional',
        description: 'Business owner',
      },
    },
  ];
  const doc = new Y.Doc();
  importWorkspaceSnapshotToYDoc(doc, snapshot);
  const replica = new Y.Doc();
  Y.applyUpdate(replica, Y.encodeStateAsUpdate(doc));
  expect(
    exportWorkspaceYDocToSnapshot(replica).drafts.find(
      (draft) => draft.draftId === snapshot.drafts[0].draftId,
    )?.state.foreignKeys,
  ).toEqual(state.foreignKeys);
  expect(
    exportWorkspaceYDocToSnapshot(replica).drafts.find(
      (draft) => draft.draftId === snapshot.drafts[0].draftId,
    )?.state.rows[0].standardId,
  ).toBe('business-id');
  doc.destroy();
  replica.destroy();
});
