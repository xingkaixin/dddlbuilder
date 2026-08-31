import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import {
  deleteWorkspaceSavedTable,
  getWorkspaceSavedTable,
  updateWorkspaceSavedTableMetadata,
  upsertWorkspaceSavedTable,
} from '@ddlbuilder/workspace-core';
import { useSavedTables } from '@/hooks/useSavedTables';
import type { SavedTableRecord } from '@/utils/workspaceStorageTypes';
import { setupFakeIndexedDB, teardownFakeIndexedDB } from '@/__tests__/utils/fakeIndexedDb';
import { createQueryClientWrapper } from '@/__tests__/utils/queryClient';

const workspace = vi.hoisted(() => ({ doc: null as Y.Doc | null }));
const scope = { kind: 'user', userId: 'metadata-user', workspaceId: 'metadata-workspace' } as const;

vi.mock('@/hooks/workspacePersistence/useWorkspaceAuthority', () => ({
  useWorkspaceAuthority: () => {
    const doc = workspace.doc;
    if (!doc) throw new Error('Workspace not initialized');
    return {
      scope,
      yDoc: doc,
      yDocReady: true,
      storage: {
        kind: 'ydoc',
        scope,
        yDoc: doc,
        transact: <T>(operation: (current: Y.Doc) => T) => doc.transact(() => operation(doc)),
      },
      refresh: async () => {},
    };
  },
}));

const record: SavedTableRecord & { tableId: string } = {
  tableId: 'users-id',
  normalizedName: 'users',
  name: 'Users',
  state: {
    schemaName: '',
    tableName: 'users',
    tableComment: 'original schema',
    dbType: 'mysql',
    sqlFormatMode: 'compact',
    rows: [],
    addCount: 1,
    indexes: [],
    authInput: '',
    authObjects: [],
  },
  folderId: 'original-folder',
  createdAt: 1,
  updatedAt: 1,
};

describe('saved table metadata writes', () => {
  beforeEach(() => {
    setupFakeIndexedDB();
    workspace.doc = new Y.Doc();
    upsertWorkspaceSavedTable(workspace.doc, record);
  });

  afterEach(() => {
    workspace.doc?.destroy();
    workspace.doc = null;
    teardownFakeIndexedDB();
  });

  it('rename preserves remote folder and trash changes received while awaiting persistence', async () => {
    const doc = workspace.doc;
    if (!doc) throw new Error('Workspace not initialized');
    const peer = new Y.Doc();
    Y.applyUpdate(peer, Y.encodeStateAsUpdate(doc));
    updateWorkspaceSavedTableMetadata(peer, record, {
      folderId: 'remote-folder',
      trashedAt: 12345,
      updatedAt: 2,
    });
    const remoteUpdate = Y.encodeStateAsUpdate(peer, Y.encodeStateVector(doc));
    const { wrapper, queryClient } = createQueryClientWrapper();
    const { result, unmount } = renderHook(() => useSavedTables(), { wrapper });

    await act(async () => {
      const pending = result.current.renameTable(record, 'Renamed Users');
      await Promise.resolve();
      Y.applyUpdate(doc, remoteUpdate);
      expect(await pending).toEqual({
        ok: true,
        normalizedName: 'renamed users',
        tableId: record.tableId,
      });
    });

    expect(getWorkspaceSavedTable(doc, record)).toMatchObject({
      tableId: record.tableId,
      normalizedName: 'renamed users',
      name: 'Renamed Users',
      folderId: 'remote-folder',
      trashedAt: 12345,
      createdAt: record.createdAt,
    });
    unmount();
    queryClient.clear();
    peer.destroy();
  });

  it.each(['move', 'trash'] as const)(
    '%s preserves remote schema and rename received while waiting for IndexedDB',
    async (operation) => {
      const doc = workspace.doc;
      if (!doc) throw new Error('Workspace not initialized');
      const peer = new Y.Doc();
      Y.applyUpdate(peer, Y.encodeStateAsUpdate(doc));
      upsertWorkspaceSavedTable(peer, {
        ...record,
        normalizedName: 'remote-users',
        name: 'Remote Users',
        state: {
          ...record.state,
          tableComment: 'remote schema',
          rows: [
            {
              id: 'remote-field',
              fieldName: 'remote_column',
              fieldType: 'bigint',
              fieldComment: '',
              nullable: true,
              defaultKind: 'none',
              defaultValue: '',
              onUpdate: 'none',
            },
          ],
        },
        updatedAt: 2,
      });
      const remoteUpdate = Y.encodeStateAsUpdate(peer, Y.encodeStateVector(doc));
      const { wrapper, queryClient } = createQueryClientWrapper();
      const { result, unmount } = renderHook(() => useSavedTables(), { wrapper });

      await act(async () => {
        const pending =
          operation === 'move'
            ? result.current.moveTableToFolder('users')
            : result.current.deleteTable('users');
        await Promise.resolve();
        Y.applyUpdate(doc, remoteUpdate);
        expect(getWorkspaceSavedTable(doc, record)?.state.tableComment).toBe('remote schema');
        expect(await pending).toEqual({
          ok: true,
          normalizedName: 'remote-users',
          tableId: record.tableId,
        });
      });

      const updated = getWorkspaceSavedTable(doc, record);
      expect(updated?.state).toEqual(getWorkspaceSavedTable(peer, record)?.state);
      expect(updated?.name).toBe('Remote Users');
      expect(updated?.createdAt).toBe(record.createdAt);
      expect(updated?.folderId).toBe(operation === 'move' ? undefined : record.folderId);
      expect(updated?.trashedAt === undefined).toBe(operation === 'move');
      unmount();
      queryClient.clear();
      peer.destroy();
    },
  );

  it.each(['move', 'trash'] as const)(
    '%s does not recreate a deleted table or modify its same-name replacement',
    async (operation) => {
      const doc = workspace.doc;
      if (!doc) throw new Error('Workspace not initialized');
      const replacement = { ...record, tableId: 'replacement-id' };
      const { wrapper, queryClient } = createQueryClientWrapper();
      const { result, unmount } = renderHook(() => useSavedTables(), { wrapper });

      await act(async () => {
        const pending =
          operation === 'move'
            ? result.current.moveTableToFolder('users', 'new-folder')
            : result.current.deleteTable('users');
        await Promise.resolve();
        doc.transact(() => {
          deleteWorkspaceSavedTable(doc, record);
          upsertWorkspaceSavedTable(doc, replacement);
        });
        expect(await pending).toEqual({ ok: false, reason: 'not_found' });
      });

      expect(getWorkspaceSavedTable(doc, record)).toBeNull();
      expect(getWorkspaceSavedTable(doc, replacement)).toMatchObject({
        folderId: record.folderId,
        updatedAt: record.updatedAt,
      });
      expect(getWorkspaceSavedTable(doc, replacement)?.trashedAt).toBeUndefined();
      unmount();
      queryClient.clear();
    },
  );
});
