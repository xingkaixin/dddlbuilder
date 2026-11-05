import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { toEditorSessionState, type PersistedState } from '@ddlbuilder/shared-types';
import {
  getSavedTableFromYDoc,
  getWorkspaceSnapshotFromYDoc,
  upsertSavedDraftInYDoc,
  upsertSavedTableInYDoc,
} from '@/services/workspaceYDocAdapter';
import { buildSchemaStateSignature } from '@ddlbuilder/workspace-core';

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
      defaultKind: 'none',
      defaultValue: '',
      onUpdate: 'none',
    },
    {
      id: 'field-blank',
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
  it('激活保存表时合并远端更新且保留未保存草稿', () => {
    const doc = new Y.Doc();
    const draftState = createState({ tableName: 'local_edit' });
    upsertSavedTableInYDoc(doc, createSavedTable({ tableName: 'saved_users' }));
    const savedRecord = getSavedTableFromYDoc(doc, 'users');
    expect(savedRecord).not.toBeNull();

    if (!savedRecord) throw new Error('saved table fixture missing');
    const savedBaseSignature = buildSchemaStateSignature(savedRecord.state);
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
      baseSignature: buildSchemaStateSignature(remoteRecord.state),
    });
  });
});
