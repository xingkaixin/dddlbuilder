import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { type PersistedState, toSchemaDocumentState } from '@ddlbuilder/shared-types';
import {
  deleteWorkspaceSavedTable,
  getWorkspaceSavedTable,
  getWorkspaceSourceState,
  listWorkspaceDrafts,
  listWorkspaceSavedTables,
  listWorkspaceTrashedDrafts,
  listWorkspaceTrashedSavedTables,
  subscribeWorkspaceYDoc,
  upsertWorkspaceDraft,
  upsertWorkspaceSavedTable,
} from '../workspaceRecords';

const createState = (tableName: string) =>
  toSchemaDocumentState({
    schemaName: 'public',
    objectType: 'table',
    tableName,
    tableComment: '',
    dbType: 'mysql',
    sqlFormatMode: 'compact',
    viewDefinition: '',
    viewCreateOrReplace: true,
    rows: [],
    addCount: 1,
    indexInput: '',
    currentIndexFields: [],
    indexes: [],
    authInput: '',
    authObjects: [],
  } satisfies PersistedState);

describe('workspace records', () => {
  it('owns draft and saved table record operations', () => {
    const doc = new Y.Doc();
    upsertWorkspaceDraft(doc, 'draft-1', {
      state: createState('draft'),
      createdAt: 1,
      updatedAt: 2,
    });
    upsertWorkspaceSavedTable(doc, {
      normalizedName: 'users',
      name: 'Users',
      state: createState('users'),
      createdAt: 3,
      updatedAt: 4,
    });

    expect(listWorkspaceDrafts(doc)).toMatchObject([
      { draftId: 'draft-1', record: { createdAt: 1, updatedAt: 2 } },
    ]);
    expect(getWorkspaceSourceState(doc, { kind: 'draft', draftId: 'draft-1' })?.tableName).toBe(
      'draft',
    );
    expect(getWorkspaceSavedTable(doc, 'users')).toMatchObject({
      name: 'Users',
      createdAt: 3,
      updatedAt: 4,
    });

    deleteWorkspaceSavedTable(doc, 'users');

    expect(getWorkspaceSavedTable(doc, 'users')).toBeNull();
  });

  it('reports the affected collection and record ids', () => {
    const doc = new Y.Doc();
    const notify = vi.fn();
    const unsubscribe = subscribeWorkspaceYDoc(doc, notify, ['drafts']);

    upsertWorkspaceDraft(doc, 'draft-1', {
      state: createState('draft'),
      updatedAt: 1,
    });

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'drafts',
        entityIds: new Set(['draft-1']),
      }),
    );

    unsubscribe();
    notify.mockClear();
    upsertWorkspaceDraft(doc, 'draft-2', {
      state: createState('draft-2'),
      updatedAt: 2,
    });
    expect(notify).not.toHaveBeenCalled();
  });

  it('keeps soft-deleted records out of active collections', () => {
    const doc = new Y.Doc();
    upsertWorkspaceDraft(doc, 'draft-1', {
      state: createState('draft'),
      updatedAt: 2,
      trashedAt: 2,
    });
    upsertWorkspaceSavedTable(doc, {
      normalizedName: 'users',
      name: 'Users',
      state: createState('users'),
      createdAt: 3,
      updatedAt: 4,
      trashedAt: 4,
    });

    expect(listWorkspaceDrafts(doc)).toEqual([]);
    expect(listWorkspaceSavedTables(doc)).toEqual([]);
    expect(listWorkspaceTrashedDrafts(doc)).toMatchObject([
      { draftId: 'draft-1', record: { trashedAt: 2 } },
    ]);
    expect(listWorkspaceTrashedSavedTables(doc)).toMatchObject([
      { normalizedName: 'users', trashedAt: 4 },
    ]);
  });
});
