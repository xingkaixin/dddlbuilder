import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { WorkspaceSnapshot } from '@ddlbuilder/shared-types/workspace';
import {
  createWorkspaceYDocUpdateFromSnapshot,
  exportWorkspaceYDocToSnapshot,
  importWorkspaceSnapshotToYDoc,
  isWorkspaceYDocInitialized,
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
  indexInput: 'email',
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
    },
  ],
  savedTables: [
    {
      normalizedName: 'users',
      name: 'Users',
      state: createState('users'),
      createdAt: 30,
      updatedAt: 40,
      folderId: 'folder-1',
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
  folders: [{ id: 'folder-1', name: 'Core', order: 1, createdAt: 5 }],
});

describe('workspace YDoc codec', () => {
  it('round-trips every workspace collection', () => {
    const doc = new Y.Doc();
    importWorkspaceSnapshotToYDoc(doc, createSnapshot());

    expect(isWorkspaceYDocInitialized(doc)).toBe(true);
    expect(exportWorkspaceYDocToSnapshot(doc)).toEqual({
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
    });
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
    expect(exportWorkspaceYDocToSnapshot(doc).drafts[1]?.state).toMatchObject({
      tableName: 'renamed',
      indexes: [],
      foreignKeys: [],
    });
  });

  it('reads legacy snapshots and normalizes malformed fine-grained values', () => {
    const doc = new Y.Doc();
    const legacy = new Y.Map<unknown>();
    legacy.set('stateSnapshot', createState('legacy'));
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
      schemaName: '',
      tableName: '',
      dbType: 'mysql',
      rows: [
        {
          order: 1,
          fieldName: '',
          nullable: '是',
        },
      ],
    });
  });

  it('reports an untouched document as uninitialized', () => {
    expect(isWorkspaceYDocInitialized(new Y.Doc())).toBe(false);
  });
});
