import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createFolder as createFolderInScope,
  deleteFolder as deleteFolderInScope,
} from '@/utils/tableFolders';
import { setupFakeIndexedDB, teardownFakeIndexedDB } from '@/__tests__/utils/fakeIndexedDb';
import { getAnonymousWorkspaceScope } from '@/utils/workspaceScope';
import { listDrafts, listTrashedDrafts, readDraft, writeDraft } from '@/utils/workspaceStateDb';
import type { PersistedState } from '@ddlbuilder/shared-types';

const anonymousScope = getAnonymousWorkspaceScope();
const createFolder = (name: string, parentId?: string) =>
  createFolderInScope(name, anonymousScope, parentId);
const deleteFolder = (id: string) => deleteFolderInScope(id, anonymousScope);
const createState = (): PersistedState => ({
  schemaName: '',
  tableName: 'users',
  tableComment: '',
  dbType: 'mysql',
  sqlFormatMode: 'compact',
  rows: [],
  addCount: 1,
  indexes: [],
  authInput: '',
  authObjects: [],
});

describe('tableFolders', () => {
  beforeEach(() => {
    setupFakeIndexedDB();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    teardownFakeIndexedDB();
  });

  it('trashes nested drafts without changing other scopes or existing trash', async () => {
    const root = await createFolder('Root');
    const child = await createFolder('Child', root.id);
    const kept = await createFolder('Kept');
    const otherScope = { kind: 'user', userId: 'u1', workspaceId: 'other' } as const;

    for (const [draftId, folderId] of [
      ['root-draft', root.id],
      ['child-draft', child.id],
      ['kept-draft', kept.id],
    ]) {
      await writeDraft(
        draftId,
        { state: createState(), folderId, createdAt: 1, updatedAt: 1 },
        anonymousScope,
      );
    }

    const alreadyTrashed = {
      state: createState(),
      folderId: child.id,
      createdAt: 1,
      updatedAt: 2,
      trashedAt: 0,
    };
    await writeDraft('already-trashed', alreadyTrashed, anonymousScope);
    await writeDraft(
      'root-draft',
      { state: createState(), folderId: root.id, createdAt: 1, updatedAt: 1 },
      otherScope,
    );

    await deleteFolder(root.id);

    expect((await listDrafts(anonymousScope)).map(({ draftId }) => draftId)).toEqual([
      'kept-draft',
    ]);
    expect(
      new Set((await listTrashedDrafts(anonymousScope)).map(({ draftId }) => draftId)),
    ).toEqual(new Set(['root-draft', 'child-draft', 'already-trashed']));
    expect(await readDraft('child-draft', anonymousScope)).toMatchObject({
      state: createState(),
      folderId: child.id,
      createdAt: 1,
      updatedAt: Date.now(),
      trashedAt: Date.now(),
    });
    expect(await readDraft('already-trashed', anonymousScope)).toMatchObject(alreadyTrashed);
    expect(await readDraft('root-draft', otherScope)).toMatchObject({
      folderId: root.id,
      updatedAt: 1,
      trashedAt: undefined,
    });
  });
});
