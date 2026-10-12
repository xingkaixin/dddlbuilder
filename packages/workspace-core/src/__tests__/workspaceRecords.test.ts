import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import type { SchemaDocumentState } from '@ddlbuilder/shared-types';
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
import { deleteWorkspaceSavedDraft, upsertWorkspaceSavedDraft } from '../workspaceSavedRecords';

const createState = (tableName: string): SchemaDocumentState => ({
  schemaName: 'public',
  objectType: 'table',
  tableName,
  tableComment: '',
  dbType: 'mysql',
  viewDefinition: '',
  viewCreateOrReplace: true,
  rows: [],
  indexes: [],
  authInput: '',
  authObjects: [],
});

describe('workspace records', () => {
  it('owns draft and saved table record operations', () => {
    const doc = new Y.Doc();
    upsertWorkspaceDraft(doc, 'draft-1', {
      state: createState('draft'),
      createdAt: 1,
      updatedAt: 2,
    });
    upsertWorkspaceSavedTable(doc, {
      tableId: 'table-users',
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

  it('flags a saved draft node replaced by a concurrent peer node', () => {
    const [loser, winner] = [1, 2].map((clientID) => Object.assign(new Y.Doc(), { clientID }));
    upsertWorkspaceSavedTable(loser, {
      tableId: 'table-users',
      normalizedName: 'users',
      name: 'Users',
      state: createState('users'),
      createdAt: 1,
      updatedAt: 1,
    });
    Y.applyUpdate(winner, Y.encodeStateAsUpdate(loser));

    const draft = (tableComment: string) => ({
      tableId: 'table-users',
      normalizedName: 'users',
      tableName: 'Users',
      state: { ...createState('users'), tableComment },
      baseSignature: 'base',
      updatedAt: 2,
    });
    const replaced = (notify: ReturnType<typeof vi.fn>) =>
      notify.mock.calls.some(([change]) => change.replacedSavedDrafts?.has('table-users'));
    upsertWorkspaceSavedDraft(loser, draft('from loser'));
    upsertWorkspaceSavedDraft(winner, draft('from winner'));
    const [loserNotify, winnerNotify] = [vi.fn(), vi.fn()];
    subscribeWorkspaceYDoc(loser, loserNotify, ['savedDrafts']);
    subscribeWorkspaceYDoc(winner, winnerNotify, ['savedDrafts']);

    Y.applyUpdate(loser, Y.encodeStateAsUpdate(winner));
    Y.applyUpdate(winner, Y.encodeStateAsUpdate(loser));

    expect(replaced(loserNotify)).toBe(true);
    expect(replaced(winnerNotify)).toBe(false);

    winnerNotify.mockClear();
    loser.transact(() => {
      deleteWorkspaceSavedDraft(loser, 'users');
      upsertWorkspaceSavedDraft(loser, draft('recreated'));
    });
    Y.applyUpdate(winner, Y.encodeStateAsUpdate(loser));

    expect(winnerNotify).toHaveBeenCalled();
    expect(replaced(winnerNotify)).toBe(false);
  });

  it('keeps soft-deleted records out of active collections', () => {
    const doc = new Y.Doc();
    upsertWorkspaceDraft(doc, 'draft-1', {
      state: createState('draft'),
      updatedAt: 2,
      trashedAt: 2,
    });
    upsertWorkspaceSavedTable(doc, {
      tableId: 'table-users',
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
