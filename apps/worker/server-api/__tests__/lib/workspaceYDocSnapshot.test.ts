import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { WorkspaceSnapshot } from '@ddlbuilder/shared-types/workspace';
import {
  createWorkspaceYDocUpdateFromSnapshot,
  exportWorkspaceYDocToSnapshot,
  isWorkspaceYDocEmpty,
} from '../../lib/workspaceYDocSnapshot.js';

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
  ],
  addCount: 12,
  indexInput: '',
  currentIndexFields: [],
  indexes: [],
  authInput: '',
  authObjects: [],
  foreignKeys: [],
});

const createSnapshot = (): WorkspaceSnapshot => ({
  globalDraft: null,
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

describe('workspaceYDocSnapshot', () => {
  it('exports imported Y.Doc updates back to a workspace snapshot', () => {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, createWorkspaceYDocUpdateFromSnapshot(createSnapshot()));

    expect(exportWorkspaceYDocToSnapshot(doc)).toEqual(createSnapshot());
    expect(isWorkspaceYDocEmpty(doc)).toBe(false);
  });

  it('exports fine-grained table data when stateSnapshot is stale', () => {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, createWorkspaceYDocUpdateFromSnapshot(createSnapshot()));
    const tableDoc = doc.getMap<Y.Map<unknown>>('drafts').get('draft-1');
    expect(tableDoc).toBeInstanceOf(Y.Map);
    (tableDoc as Y.Map<unknown>).set('stateSnapshot', createState('stale'));

    expect(exportWorkspaceYDocToSnapshot(doc).drafts[0]?.state.tableName).toBe('draft_users');
  });

  it('detects empty workspace Y.Doc content', () => {
    expect(isWorkspaceYDocEmpty(new Y.Doc())).toBe(true);
  });

  it('treats an initialized document with empty collections as authoritative', () => {
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

    expect(isWorkspaceYDocEmpty(doc)).toBe(false);
  });
});
