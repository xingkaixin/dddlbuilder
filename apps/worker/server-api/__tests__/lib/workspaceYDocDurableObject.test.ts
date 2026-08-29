import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as decoding from 'lib0/decoding';
import type { PersistedState } from '@ddlbuilder/shared-types';
import {
  encodeWorkspaceYDocSyncMessage,
  encodeWorkspaceYDocTrackedSyncMessage,
  readWorkspaceYDocMessageHeader,
} from '@ddlbuilder/workspace-core';
import type {
  WorkspaceMigrationSnapshot,
  WorkspaceSnapshot,
} from '@ddlbuilder/shared-types/workspace';
import type { WorkspaceMigrationResult } from '@ddlbuilder/shared-types/api';
import type { ApiEnv } from '../../lib/context.js';
import { createDurableObjectState } from '../helpers/durableObjectState';

const toArrayBuffer = (bytes: Uint8Array) =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

const trackedUpdate = (update: Uint8Array, requestId: number) =>
  toArrayBuffer(
    encodeWorkspaceYDocTrackedSyncMessage(
      requestId,
      encodeWorkspaceYDocSyncMessage((encoder) => syncProtocol.writeUpdate(encoder, update)),
    ),
  );

const createState = (tableName: string): PersistedState => ({
  schemaName: '',
  objectType: 'table',
  tableName,
  tableComment: '',
  dbType: 'mysql',
  sqlFormatMode: 'compact',
  viewDefinition: '',
  viewCreateOrReplace: true,
  rows: [],
  addCount: 12,
  indexes: [],
  authInput: '',
  authObjects: [],
  foreignKeys: [],
});

const createSnapshot = (tableName: string, updatedAt = 2): WorkspaceSnapshot => ({
  globalDraft: null,
  drafts: [
    {
      draftId: 'default',
      state: createState(tableName),
      createdAt: 1,
      updatedAt,
    },
  ],
  savedTables: [],
  savedDrafts: [],
  folders: [],
});

const createEnv = (): ApiEnv['Bindings'] =>
  ({
    USER_DB: {
      prepare: () => ({
        bind: () => ({ all: async () => ({ results: [{ id: 'session-1' }] }) }),
      }),
    } as unknown as D1Database,
  }) as ApiEnv['Bindings'];

const createRequest = (path: string, init: RequestInit = {}) => {
  const headers = new Headers(init.headers);
  headers.set('x-ddlbuilder-workspace-id', 'ws-1');
  headers.set('x-ddlbuilder-user-id', 'user-1');
  return new Request(`http://localhost${path}`, {
    ...init,
    headers,
  });
};

const createWebSocket = (
  attachment: unknown = {
    schemaVersion: 1,
    socketId: 'socket-1',
    workspaceId: 'ws-1',
    userId: 'user-1',
    sessionId: 'session-1',
    connectedAt: 1,
  },
): WebSocket & {
  send: ReturnType<typeof vi.fn>;
  serializeAttachment: ReturnType<typeof vi.fn>;
  deserializeAttachment: ReturnType<typeof vi.fn>;
} => {
  let storedAttachment = attachment;
  return {
    readyState: 1,
    send: vi.fn(),
    close: vi.fn(),
    serializeAttachment: vi.fn((nextAttachment: unknown) => {
      storedAttachment = nextAttachment;
    }),
    deserializeAttachment: vi.fn(() => storedAttachment),
  } as unknown as WebSocket & {
    send: ReturnType<typeof vi.fn>;
    serializeAttachment: ReturnType<typeof vi.fn>;
    deserializeAttachment: ReturnType<typeof vi.fn>;
  };
};

describe('WorkspaceYDocDurableObject checkpoint', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('rejects request identity changes after the object is bound', async () => {
    const { WorkspaceYDocDurableObject } = await import('../../lib/workspaceYDocDurableObject.js');
    const { state, store } = createDurableObjectState();
    const doc = new Y.Doc();
    doc.getMap('meta').set('schemaVersion', 1);
    store.set('snapshot', Y.encodeStateAsUpdate(doc));
    const object = new WorkspaceYDocDurableObject(state, createEnv());

    expect((await object.fetch(createRequest('/state'))).status).toBe(200);
    const mismatch = await object.fetch(
      new Request('http://localhost/state', {
        headers: {
          'x-ddlbuilder-workspace-id': 'ws-2',
          'x-ddlbuilder-user-id': 'user-2',
        },
      }),
    );

    expect(mismatch.status).toBe(409);
    expect(await mismatch.text()).toBe('Workspace identity mismatch');
    expect((await object.fetch(createRequest('/state'))).status).toBe(200);
    doc.destroy();
  });

  it('prefers stored identity over mismatched cold-start headers', async () => {
    const { WorkspaceYDocDurableObject } = await import('../../lib/workspaceYDocDurableObject.js');
    const { state, store } = createDurableObjectState();
    const doc = new Y.Doc();
    doc.getMap('meta').set('schemaVersion', 1);
    store.set('snapshot', Y.encodeStateAsUpdate(doc));
    store.set('meta', {
      workspaceId: 'ws-1',
      userId: 'user-1',
      schemaVersion: 1,
      nextSeq: 0,
      updateCount: 0,
      updateBytes: 0,
      updatedAt: 1,
      lastCompactedSeq: 0,
      lastCheckpointSeq: 0,
    });
    const object = new WorkspaceYDocDurableObject(state, createEnv());

    const mismatch = await object.fetch(
      new Request('http://localhost/state', {
        headers: {
          'x-ddlbuilder-workspace-id': 'ws-2',
          'x-ddlbuilder-user-id': 'user-2',
        },
      }),
    );

    expect(mismatch.status).toBe(409);
    expect((await object.fetch(createRequest('/state'))).status).toBe(200);
    doc.destroy();
  });

  it('initializes a new document before serving it', async () => {
    const { WorkspaceYDocDurableObject } = await import('../../lib/workspaceYDocDurableObject.js');
    const { state, store } = createDurableObjectState();
    const object = new WorkspaceYDocDurableObject(state, createEnv());

    await object.fetch(new Request('http://localhost/state'));
    expect(store.has('snapshot')).toBe(true);
    const coldObject = new WorkspaceYDocDurableObject(state, createEnv());
    const response = await coldObject.fetch(new Request('http://localhost/state'));
    const doc = new Y.Doc();
    Y.applyUpdate(doc, new Uint8Array(await response.arrayBuffer()));

    expect(doc.getMap('meta').get('schemaVersion')).toBe(1);
    doc.destroy();
  });

  it.each([
    ['missing', undefined],
    ['future', 2],
  ])('rejects a stored document with a %s schema version', async (_name, schemaVersion) => {
    const { WorkspaceYDocDurableObject } = await import('../../lib/workspaceYDocDurableObject.js');
    const { state, store } = createDurableObjectState();
    const doc = new Y.Doc();
    if (schemaVersion !== undefined) doc.getMap('meta').set('schemaVersion', schemaVersion);
    store.set('snapshot', Y.encodeStateAsUpdate(doc));
    const object = new WorkspaceYDocDurableObject(state, createEnv());

    await expect(object.fetch(new Request('http://localhost/state'))).rejects.toThrow(
      `Unsupported workspace schema version: ${String(schemaVersion)}`,
    );
    doc.destroy();
  });

  it('closes sockets whose attachment identity differs from the object', async () => {
    const { WorkspaceYDocDurableObject } = await import('../../lib/workspaceYDocDurableObject.js');
    const { state, store } = createDurableObjectState();
    const doc = new Y.Doc();
    doc.getMap('meta').set('schemaVersion', 1);
    store.set('snapshot', Y.encodeStateAsUpdate(doc));
    const object = new WorkspaceYDocDurableObject(state, createEnv());
    await object.fetch(createRequest('/state'));
    const socket = createWebSocket({
      schemaVersion: 1,
      workspaceId: 'ws-2',
      userId: 'user-2',
      sessionId: 'session-1',
    });

    await object.webSocketMessage(socket, trackedUpdate(Y.encodeStateAsUpdate(doc), 1));

    expect(socket.close).toHaveBeenCalledWith(1008, 'Workspace access denied');
    expect(socket.send).not.toHaveBeenCalled();
    doc.destroy();
  });

  it('keeps valid state after rejecting a malformed update', async () => {
    const { WorkspaceYDocDurableObject } = await import('../../lib/workspaceYDocDurableObject.js');
    const { exportWorkspaceYDocToSnapshot } = await import('@ddlbuilder/workspace-core');
    const { state, store } = createDurableObjectState();
    const current = new Y.Doc();
    current.getMap('meta').set('schemaVersion', 1);
    store.set('snapshot', Y.encodeStateAsUpdate(current));
    const source = new Y.Doc();
    Y.applyUpdate(source, Y.encodeStateAsUpdate(current));
    const socket = createWebSocket();
    const object = new WorkspaceYDocDurableObject(state, createEnv());
    source.getMap('accepted').set('first', true);

    await object.webSocketMessage(socket, trackedUpdate(Y.encodeStateAsUpdate(source), 1));
    expect(socket.close).not.toHaveBeenCalled();
    expect(socket.send).toHaveBeenCalledOnce();

    const recovery = new Y.Doc();
    Y.applyUpdate(recovery, Y.encodeStateAsUpdate(source));
    socket.send.mockClear();
    source.getMap<unknown>('drafts').set('bad', 'not-a-map');

    await object.webSocketMessage(socket, trackedUpdate(Y.encodeStateAsUpdate(source), 2));

    expect(socket.close).toHaveBeenCalledWith(1008, 'Invalid workspace update');
    expect(socket.send).not.toHaveBeenCalled();
    recovery.getMap('accepted').set('second', true);
    const recoveredSocket = createWebSocket();
    await object.webSocketMessage(
      recoveredSocket,
      trackedUpdate(Y.encodeStateAsUpdate(recovery), 3),
    );
    expect(recoveredSocket.close).not.toHaveBeenCalled();
    expect(recoveredSocket.send).toHaveBeenCalledOnce();

    const response = await object.fetch(createRequest('/state'));
    const restored = new Y.Doc();
    Y.applyUpdate(restored, new Uint8Array(await response.arrayBuffer()));
    const expectedSnapshot = {
      globalDraft: null,
      drafts: [],
      savedTables: [],
      savedDrafts: [],
      folders: [],
    };
    expect(exportWorkspaceYDocToSnapshot(restored)).toEqual(expectedSnapshot);
    expect(Object.fromEntries(restored.getMap('accepted').entries())).toEqual({
      first: true,
      second: true,
    });

    const cold = new WorkspaceYDocDurableObject(state, createEnv());
    const coldResponse = await cold.fetch(createRequest('/state'));
    const persisted = new Y.Doc();
    Y.applyUpdate(persisted, new Uint8Array(await coldResponse.arrayBuffer()));
    expect(exportWorkspaceYDocToSnapshot(persisted)).toEqual(expectedSnapshot);
    expect(Object.fromEntries(persisted.getMap('accepted').entries())).toEqual({
      first: true,
      second: true,
    });
    current.destroy();
    source.destroy();
    recovery.destroy();
    restored.destroy();
    persisted.destroy();
  });

  it.each([
    ['remove', undefined],
    ['replace with a future version', 2],
  ])('rejects updates that %s the workspace schema version', async (_name, schemaVersion) => {
    const { WorkspaceYDocDurableObject } = await import('../../lib/workspaceYDocDurableObject.js');
    const { state, store } = createDurableObjectState();
    const current = new Y.Doc();
    current.getMap('meta').set('schemaVersion', 1);
    store.set('snapshot', Y.encodeStateAsUpdate(current));
    const source = new Y.Doc();
    Y.applyUpdate(source, Y.encodeStateAsUpdate(current));
    if (schemaVersion === undefined) source.getMap('meta').delete('schemaVersion');
    else source.getMap('meta').set('schemaVersion', schemaVersion);
    const socket = createWebSocket();
    const object = new WorkspaceYDocDurableObject(state, createEnv());

    await object.webSocketMessage(socket, trackedUpdate(Y.encodeStateAsUpdate(source), 2));

    expect(socket.close).toHaveBeenCalledWith(1008, 'Invalid workspace update');
    expect(socket.send).not.toHaveBeenCalled();
    const response = await object.fetch(createRequest('/state'));
    const restored = new Y.Doc();
    Y.applyUpdate(restored, new Uint8Array(await response.arrayBuffer()));
    expect(restored.getMap('meta').get('schemaVersion')).toBe(1);
    current.destroy();
    source.destroy();
    restored.destroy();
  });

  it('rejects text websocket messages', async () => {
    const { WorkspaceYDocDurableObject } = await import('../../lib/workspaceYDocDurableObject.js');
    const { state } = createDurableObjectState();
    const socket = createWebSocket();
    const object = new WorkspaceYDocDurableObject(state, createEnv());

    await object.webSocketMessage(socket, 'invalid');

    expect(socket.close).toHaveBeenCalledWith(1003, 'Binary workspace updates required');
    expect(state.storage.get).not.toHaveBeenCalled();
  });

  it('rejects oversized websocket messages before loading the document', async () => {
    const { WorkspaceYDocDurableObject } = await import('../../lib/workspaceYDocDurableObject.js');
    const { state } = createDurableObjectState();
    const socket = createWebSocket();
    const object = new WorkspaceYDocDurableObject(state, createEnv());

    await object.webSocketMessage(socket, new ArrayBuffer(16 * 1024 * 1024 + 1));

    expect(socket.close).toHaveBeenCalledWith(1009, 'Workspace update too large');
    expect(state.storage.get).not.toHaveBeenCalled();
    expect(state.storage.list).not.toHaveBeenCalled();
  });

  it('batches queued updates and reads the alarm only once', async () => {
    const { WorkspaceYDocDurableObject } = await import('../../lib/workspaceYDocDurableObject.js');
    const { state, store } = createDurableObjectState();
    const doc = new Y.Doc();
    doc.getMap('meta').set('schemaVersion', 1);
    store.set('snapshot', Y.encodeStateAsUpdate(doc));
    const object = new WorkspaceYDocDurableObject(state, createEnv());
    const ws = createWebSocket();
    await object.fetch(new Request('http://localhost/state'));
    const messages = Array.from({ length: 8 }, (_, i) => {
      doc.getMap('fields').set(String(i), String(i));
      return trackedUpdate(Y.encodeStateAsUpdate(doc), i);
    });
    await Promise.all(messages.map((message) => object.webSocketMessage(ws, message)));
    expect(state.storage.transaction).toHaveBeenCalledTimes(1);
    expect(state.storage.getAlarm).toHaveBeenCalledTimes(1);
    const restored = new Y.Doc();
    const response = await new WorkspaceYDocDurableObject(state, createEnv()).fetch(
      new Request('http://localhost/state'),
    );
    Y.applyUpdate(restored, new Uint8Array(await response.arrayBuffer()));
    expect(restored.getMap('fields').size).toBe(8);
    doc.destroy();
    restored.destroy();
  });

  it('acknowledges a batch only after storage completes and survives a cold reload', async () => {
    const { WorkspaceYDocDurableObject } = await import('../../lib/workspaceYDocDurableObject.js');
    const { state, store } = createDurableObjectState();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.mocked(
      state.storage.put as (key: string, value: unknown) => Promise<void>,
    ).mockImplementation(async (key, value) => {
      if (key.startsWith('update:')) await gate;
      store.set(key, value);
    });
    const durableObject = new WorkspaceYDocDurableObject(state, createEnv());
    const ws = createWebSocket();
    const doc = new Y.Doc();
    doc.getMap('meta').set('schemaVersion', 1);
    store.set('snapshot', Y.encodeStateAsUpdate(doc));
    doc.getMap('fields').set('field', 'persisted value');
    const processing = durableObject.webSocketMessage(
      ws,
      trackedUpdate(Y.encodeStateAsUpdate(doc), 42),
    );
    await vi.waitFor(() => expect(state.storage.put).toHaveBeenCalled());
    expect(ws.send).not.toHaveBeenCalled();

    release();
    await processing;
    expect(ws.send).toHaveBeenCalledTimes(1);
    const acknowledgement = decoding.createDecoder(ws.send.mock.calls[0][0]);
    expect(readWorkspaceYDocMessageHeader(acknowledgement)).toEqual({
      kind: 'persisted',
      requestId: 42,
    });

    const coldObject = new WorkspaceYDocDurableObject(state, createEnv());
    const response = await coldObject.fetch(new Request('http://localhost/state'));
    const restored = new Y.Doc();
    Y.applyUpdate(restored, new Uint8Array(await response.arrayBuffer()));
    expect(restored.getMap('fields').get('field')).toBe('persisted value');
    doc.destroy();
    restored.destroy();
  });

  it('does not acknowledge a failed write and closes the socket for reconnect', async () => {
    const { WorkspaceYDocDurableObject } = await import('../../lib/workspaceYDocDurableObject.js');
    const { state, store } = createDurableObjectState();
    vi.mocked(state.storage.put).mockRejectedValue(new Error('storage failed'));
    const durableObject = new WorkspaceYDocDurableObject(state, createEnv());
    const ws = createWebSocket();
    const doc = new Y.Doc();
    doc.getMap('meta').set('schemaVersion', 1);
    store.set('snapshot', Y.encodeStateAsUpdate(doc));
    doc.getMap('fields').set('field', 'not yet persisted');

    await expect(
      durableObject.webSocketMessage(ws, trackedUpdate(Y.encodeStateAsUpdate(doc), 7)),
    ).rejects.toThrow('storage failed');
    expect(ws.send).not.toHaveBeenCalled();
    expect(ws.close).toHaveBeenCalledWith(1011, 'Workspace persistence failed');
    doc.destroy();
  });

  it('reuses the cached authorization for repeated messages within the TTL window', async () => {
    const { WorkspaceYDocDurableObject } = await import('../../lib/workspaceYDocDurableObject.js');
    const { state, store } = createDurableObjectState();
    const prepare = vi.fn(() => ({
      bind: () => ({ all: async () => ({ results: [{ id: 'session-1' }] }) }),
    }));
    const durableObject = new WorkspaceYDocDurableObject(state, {
      USER_DB: { prepare },
    } as unknown as ApiEnv['Bindings']);
    const ws = createWebSocket();
    const doc = new Y.Doc();
    doc.getMap('meta').set('schemaVersion', 1);
    store.set('snapshot', Y.encodeStateAsUpdate(doc));

    await durableObject.webSocketMessage(ws, trackedUpdate(Y.encodeStateAsUpdate(doc), 1));
    await durableObject.webSocketMessage(ws, trackedUpdate(Y.encodeStateAsUpdate(doc), 2));

    const authQueries = prepare.mock.calls.filter(([sql]) =>
      String(sql).includes('LEFT JOIN session'),
    );
    expect(authQueries).toHaveLength(1);
    doc.destroy();
  });

  it.each(['read', 'snapshot'])('retries initialization after a failed %s', async (failure) => {
    const getWorkspaceSnapshotForWorkspace = vi.fn().mockResolvedValue(createSnapshot('users'));
    if (failure === 'read') {
      getWorkspaceSnapshotForWorkspace.mockRejectedValueOnce(new Error('temporary failure'));
    }
    vi.doMock('../../lib/workspaceEntities.js', () => ({
      checkpointWorkspaceSnapshotEntities: vi.fn(),
      getWorkspaceSnapshotForWorkspace,
    }));
    const { WorkspaceYDocDurableObject } = await import('../../lib/workspaceYDocDurableObject.js');
    const { exportWorkspaceYDocToSnapshot } = await import('@ddlbuilder/workspace-core');
    const { state, store } = createDurableObjectState();
    if (failure === 'snapshot') {
      vi.mocked(state.storage.put).mockImplementationOnce(async () => {
        throw new Error('temporary failure');
      });
    }
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const durableObject = new WorkspaceYDocDurableObject(state, createEnv());
    const request = () => createRequest('/api/workspaces/ws-1/yjs/state');

    await expect(durableObject.fetch(request())).rejects.toThrow('temporary failure');

    const responses = await Promise.all([
      durableObject.fetch(request()),
      durableObject.fetch(request()),
    ]);
    for (const response of responses) {
      const restoredDoc = new Y.Doc();
      Y.applyUpdate(restoredDoc, new Uint8Array(await response.arrayBuffer()));
      expect(exportWorkspaceYDocToSnapshot(restoredDoc).drafts[0]?.state.tableName).toBe('users');
      restoredDoc.destroy();
    }
    expect(store.has('snapshot')).toBe(true);
    expect(getWorkspaceSnapshotForWorkspace).toHaveBeenCalledTimes(2);
  });

  it('checkpoints imported snapshots during compact', async () => {
    const checkpointWorkspaceSnapshotEntities = vi.fn().mockResolvedValue({
      cursor: 1,
      upserted: 1,
      deleted: 0,
      skipped: 0,
    });
    vi.doMock('../../lib/workspaceEntities.js', () => ({
      checkpointWorkspaceSnapshotEntities,
      getWorkspaceSnapshotForWorkspace: vi.fn().mockResolvedValue({
        globalDraft: null,
        drafts: [],
        savedTables: [],
        savedDrafts: [],
        folders: [],
      }),
    }));
    const { WorkspaceYDocDurableObject } = await import('../../lib/workspaceYDocDurableObject.js');
    const { state, store } = createDurableObjectState();
    store.set('meta', {
      workspaceId: 'ws-1',
      schemaVersion: 1,
      nextSeq: 0,
      updateCount: 0,
      updateBytes: 0,
      updatedAt: 1,
      lastCompactedSeq: 0,
    });
    const durableObject = new WorkspaceYDocDurableObject(state, createEnv());

    const response = await durableObject.fetch(
      createRequest('/api/workspaces/ws-1/yjs/import', {
        method: 'POST',
        body: JSON.stringify(createSnapshot('users')),
      }),
    );

    expect(response.status).toBe(200);
    expect(checkpointWorkspaceSnapshotEntities).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      'ws-1',
      expect.objectContaining({
        drafts: [expect.objectContaining({ draftId: 'default' })],
      }),
    );
  });

  it('imports newer records in place and keeps them through retries and restart', async () => {
    vi.doMock('../../lib/workspaceEntities.js', () => ({
      checkpointWorkspaceSnapshotEntities: vi.fn(),
      getWorkspaceSnapshotForWorkspace: vi.fn().mockResolvedValue({
        globalDraft: null,
        drafts: [],
        savedTables: [],
        savedDrafts: [],
        folders: [],
      }),
    }));
    const { WorkspaceYDocDurableObject } = await import('../../lib/workspaceYDocDurableObject.js');
    const { exportWorkspaceYDocToSnapshot } = await import('@ddlbuilder/workspace-core');
    const { state } = createDurableObjectState();
    const durableObject = new WorkspaceYDocDurableObject(state, createEnv());
    const peer = new Y.Doc();
    const syncPeer = async () => {
      const response = await durableObject.fetch(createRequest('/api/workspaces/ws-1/yjs/state'));
      Y.applyUpdate(peer, new Uint8Array(await response.arrayBuffer()));
    };
    const initial = createSnapshot('original');
    initial.drafts.push({ draftId: 'untouched', state: createState('other'), updatedAt: 1 });

    try {
      await durableObject.fetch(
        createRequest('/api/workspaces/ws-1/yjs/import', {
          method: 'POST',
          body: JSON.stringify(initial),
        }),
      );
      await syncPeer();
      const originalRecord = peer.getMap('drafts').get('default');
      expect(originalRecord).toBeInstanceOf(Y.Map);

      for (const [name, updatedAt] of [
        ['updated', 3],
        ['stale', 2],
        ['tie', 3],
        ['updated', 3],
      ] as const) {
        const response = await durableObject.fetch(
          createRequest('/api/workspaces/ws-1/yjs/import', {
            method: 'POST',
            body: JSON.stringify(createSnapshot(name, updatedAt)),
          }),
        );
        expect(response.status).toBe(200);
        await syncPeer();
        expect(peer.getMap('drafts').get('default')).toBe(originalRecord);
        expect(exportWorkspaceYDocToSnapshot(peer).drafts).toEqual([
          expect.objectContaining({
            draftId: 'default',
            updatedAt: 3,
            state: expect.objectContaining({ tableName: 'updated' }),
          }),
          expect.objectContaining({ draftId: 'untouched' }),
        ]);
      }

      const coldObject = new WorkspaceYDocDurableObject(state, createEnv());
      const response = await coldObject.fetch(createRequest('/api/workspaces/ws-1/yjs/state'));
      const restored = new Y.Doc();
      try {
        Y.applyUpdate(restored, new Uint8Array(await response.arrayBuffer()));
        expect(exportWorkspaceYDocToSnapshot(restored)).toEqual(
          exportWorkspaceYDocToSnapshot(peer),
        );
      } finally {
        restored.destroy();
      }
    } finally {
      peer.destroy();
    }
  });

  it('persists an imported empty workspace as initialized', async () => {
    const empty: WorkspaceSnapshot = {
      globalDraft: null,
      drafts: [],
      savedTables: [],
      savedDrafts: [],
      folders: [],
    };
    const getWorkspaceSnapshotForWorkspace = vi.fn().mockResolvedValue(empty);
    vi.doMock('../../lib/workspaceEntities.js', () => ({
      checkpointWorkspaceSnapshotEntities: vi.fn(),
      getWorkspaceSnapshotForWorkspace,
    }));
    const { WorkspaceYDocDurableObject } = await import('../../lib/workspaceYDocDurableObject.js');
    const { exportWorkspaceYDocToSnapshot, isWorkspaceYDocInitialized } =
      await import('@ddlbuilder/workspace-core');
    const { state } = createDurableObjectState();
    await new WorkspaceYDocDurableObject(state, createEnv()).fetch(
      createRequest('/api/workspaces/ws-1/yjs/import', {
        method: 'POST',
        body: JSON.stringify(empty),
      }),
    );
    getWorkspaceSnapshotForWorkspace.mockResolvedValue(createSnapshot('stale'));
    const coldObject = new WorkspaceYDocDurableObject(state, createEnv());
    const response = await coldObject.fetch(createRequest('/api/workspaces/ws-1/yjs/state'));
    const restored = new Y.Doc();
    try {
      Y.applyUpdate(restored, new Uint8Array(await response.arrayBuffer()));
      expect(isWorkspaceYDocInitialized(restored)).toBe(true);
      expect(exportWorkspaceYDocToSnapshot(restored)).toEqual(empty);
    } finally {
      restored.destroy();
    }
  });

  it('persists and reloads imports larger than the storage value limit', async () => {
    vi.doMock('../../lib/workspaceEntities.js', () => ({
      checkpointWorkspaceSnapshotEntities: vi.fn(),
      getWorkspaceSnapshotForWorkspace: vi.fn().mockResolvedValue({
        globalDraft: null,
        drafts: [],
        savedTables: [],
        savedDrafts: [],
        folders: [],
      }),
    }));
    const { WorkspaceYDocDurableObject } = await import('../../lib/workspaceYDocDurableObject.js');
    const { exportWorkspaceYDocToSnapshot } = await import('@ddlbuilder/workspace-core');
    const { state, store } = createDurableObjectState();
    const storageValueLimit = 2 * 1024 * 1024;
    vi.mocked(
      state.storage.put as (key: string, value: unknown) => Promise<void>,
    ).mockImplementation(async (key, value) => {
      if (value instanceof Uint8Array && value.byteLength > storageValueLimit) {
        throw new Error('SQLITE_TOOBIG');
      }
      store.set(key, value);
    });
    const snapshot: WorkspaceSnapshot = {
      globalDraft: null,
      drafts: [],
      savedDrafts: [],
      folders: [],
      savedTables: Array.from({ length: 2 }, (_, table) => ({
        tableId: `table-${table}`,
        normalizedName: `table_${table}`,
        name: `table_${table}`,
        createdAt: 1,
        updatedAt: 1,
        state: {
          ...createState(`table_${table}`),
          rows: Array.from({ length: 2 }, (_, row) => ({
            id: `row-${row}`,
            fieldName: `column_${row}`,
            fieldType: 'varchar(255)',
            // Exercise the byte limit without creating thousands of CRDT records.
            fieldComment: `${table}:${row}:${'x'.repeat(storageValueLimit / 4)}`,
            nullable: true,
            defaultKind: 'none',
            defaultValue: '',
            onUpdate: 'none',
          })),
        },
      })),
    };
    const response = await new WorkspaceYDocDurableObject(state, createEnv()).fetch(
      createRequest('/api/workspaces/ws-1/yjs/import', {
        method: 'POST',
        body: JSON.stringify(snapshot),
      }),
    );
    expect(response.status).toBe(200);
    const cold = new WorkspaceYDocDurableObject(state, createEnv());
    const restored = new Y.Doc();
    try {
      const response = await cold.fetch(createRequest('/api/workspaces/ws-1/yjs/state'));
      const bytes = new Uint8Array(await response.arrayBuffer());
      expect(bytes.byteLength).toBeGreaterThan(storageValueLimit);
      Y.applyUpdate(restored, bytes);
      const tables = exportWorkspaceYDocToSnapshot(restored).savedTables;
      expect(Object.fromEntries(tables.map((table) => [table.tableId, table.state.rows]))).toEqual(
        Object.fromEntries(snapshot.savedTables.map((table) => [table.tableId, table.state.rows])),
      );
    } finally {
      restored.destroy();
    }
  });

  it('merges migration records without replacing authoritative state', async () => {
    const checkpointWorkspaceSnapshotEntities = vi.fn().mockResolvedValue({
      cursor: 1,
      upserted: 1,
      deleted: 0,
      skipped: 0,
    });
    vi.doMock('../../lib/workspaceEntities.js', () => ({
      checkpointWorkspaceSnapshotEntities,
      getWorkspaceSnapshotForWorkspace: vi.fn().mockResolvedValue({
        globalDraft: null,
        drafts: [],
        savedTables: [],
        savedDrafts: [],
        folders: [],
      }),
    }));
    const { WorkspaceYDocDurableObject } = await import('../../lib/workspaceYDocDurableObject.js');
    const { state } = createDurableObjectState();
    const durableObject = new WorkspaceYDocDurableObject(state, createEnv());
    await durableObject.fetch(
      createRequest('/api/workspaces/ws-1/yjs/import', {
        method: 'POST',
        body: JSON.stringify(createSnapshot('current')),
      }),
    );

    const migrationSnapshot: WorkspaceSnapshot = {
      globalDraft: null,
      drafts: [],
      savedTables: [
        {
          normalizedName: 'imported',
          name: 'Imported',
          state: createState('imported'),
          createdAt: 3,
          updatedAt: 4,
        },
      ],
      savedDrafts: [],
      folders: [],
    };
    const response = await durableObject.fetch(
      createRequest('/api/workspaces/ws-1/yjs/migrate', {
        method: 'POST',
        body: JSON.stringify(migrationSnapshot),
      }),
    );

    expect(response.status).toBe(200);
    expect(checkpointWorkspaceSnapshotEntities).toHaveBeenLastCalledWith(
      expect.anything(),
      'user-1',
      'ws-1',
      expect.objectContaining({
        drafts: [expect.objectContaining({ draftId: 'default' })],
        savedTables: [expect.objectContaining({ normalizedName: 'imported' })],
      }),
    );
  });

  it.each([undefined, 'table-users'])(
    'preserves concurrent migration versions and draft ownership after restart (%s)',
    async (tableId) => {
      vi.doMock('../../lib/workspaceEntities.js', () => ({
        checkpointWorkspaceSnapshotEntities: vi.fn(),
        getWorkspaceSnapshotForWorkspace: vi.fn().mockResolvedValue({
          globalDraft: null,
          drafts: [],
          savedTables: [],
          savedDrafts: [],
          folders: [],
        }),
      }));
      const { WorkspaceYDocDurableObject } =
        await import('../../lib/workspaceYDocDurableObject.js');
      const { exportWorkspaceYDocToSnapshot } = await import('@ddlbuilder/workspace-core');
      const { state } = createDurableObjectState();
      const durableObject = new WorkspaceYDocDurableObject(state, createEnv());
      const snapshot = (comment: string, updatedAt: number): WorkspaceMigrationSnapshot => ({
        globalDraft: null,
        activeSession: null,
        drafts: [],
        folders: [],
        savedTables: [
          {
            tableId,
            name: 'users',
            normalizedName: 'users',
            createdAt: 1,
            updatedAt,
            state: { ...createState('users'), tableComment: comment },
          },
        ],
        savedDrafts: [
          {
            tableId,
            tableName: 'users',
            normalizedName: 'users',
            updatedAt,
            baseSignature: comment,
            state: { ...createState('users'), tableComment: `${comment} draft` },
          },
        ],
      });
      const migrate = (payload: WorkspaceMigrationSnapshot) =>
        durableObject.fetch(
          createRequest('/api/workspaces/ws-1/yjs/migrate', {
            method: 'POST',
            body: JSON.stringify(payload),
          }),
        );
      const payloads = [snapshot('version A', 100), snapshot('version B', 200)];
      const responses = await Promise.all(payloads.map(migrate));
      const results: WorkspaceMigrationResult[] = await Promise.all(
        responses.map((response) => response.json()),
      );
      expect(responses.map((response) => response.status)).toEqual([200, 200]);
      expect(results.map((result) => result.createdCount).sort((a, b) => a - b)).toEqual([0, 2]);
      expect(results.map((result) => result.copiedCount).sort((a, b) => a - b)).toEqual([0, 2]);

      const retry = await migrate(payloads[1]);
      expect(await retry.json()).toMatchObject({
        createdCount: 0,
        copiedCount: 0,
        skippedCount: 2,
      });
      const coldObject = new WorkspaceYDocDurableObject(state, createEnv());
      const response = await coldObject.fetch(createRequest('/api/workspaces/ws-1/yjs/state'));
      const restored = new Y.Doc();
      try {
        Y.applyUpdate(restored, new Uint8Array(await response.arrayBuffer()));
        const final = exportWorkspaceYDocToSnapshot(restored);
        expect(final.savedTables.map((table) => table.state.tableComment).sort()).toEqual([
          'version A',
          'version B',
        ]);
        expect(final.savedDrafts).toHaveLength(2);
        for (const table of final.savedTables) {
          expect(final.savedDrafts.find((draft) => draft.tableId === table.tableId)).toMatchObject({
            baseSignature: table.state.tableComment,
            state: { tableComment: `${table.state.tableComment} draft` },
          });
        }
      } finally {
        restored.destroy();
      }
    },
  );

  it.each(['import', 'migrate'])(
    'rejects %s when Durable Object storage cannot persist its update',
    async (operation) => {
      vi.doMock('../../lib/workspaceEntities.js', () => ({
        checkpointWorkspaceSnapshotEntities: vi.fn(),
        getWorkspaceSnapshotForWorkspace: vi.fn().mockResolvedValue({
          globalDraft: null,
          drafts: [],
          savedTables: [],
          savedDrafts: [],
          folders: [],
        }),
      }));
      const { WorkspaceYDocDurableObject } =
        await import('../../lib/workspaceYDocDurableObject.js');
      const { state, store } = createDurableObjectState();
      vi.mocked(
        state.storage.put as (key: string, value: unknown) => Promise<void>,
      ).mockImplementation(async (key, value) => {
        if (key.startsWith('update:')) {
          throw new Error('storage unavailable');
        }
        store.set(key, value);
      });
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      const durableObject = new WorkspaceYDocDurableObject(state, createEnv());

      await expect(
        durableObject.fetch(
          createRequest(`/api/workspaces/ws-1/yjs/${operation}`, {
            method: 'POST',
            body: JSON.stringify(createSnapshot('users')),
          }),
        ),
      ).rejects.toThrow('storage unavailable');
      expect(error).toHaveBeenCalledWith(
        '[workspace-yjs-do] persist failed',
        expect.objectContaining({ message: 'storage unavailable' }),
      );
    },
  );

  it('retries a failed update before persisting later updates', async () => {
    vi.doMock('../../lib/workspaceEntities.js', () => ({
      checkpointWorkspaceSnapshotEntities: vi.fn(),
      getWorkspaceSnapshotForWorkspace: vi.fn().mockResolvedValue({
        globalDraft: null,
        drafts: [],
        savedTables: [],
        savedDrafts: [],
        folders: [],
      }),
    }));
    const { WorkspaceYDocDurableObject } = await import('../../lib/workspaceYDocDurableObject.js');
    const { state, store } = createDurableObjectState();
    let failNextUpdate = true;
    vi.mocked(
      state.storage.put as (key: string, value: unknown) => Promise<void>,
    ).mockImplementation(async (key, value) => {
      if (key.startsWith('update:') && failNextUpdate) {
        failNextUpdate = false;
        throw new Error('storage temporarily unavailable');
      }
      store.set(key, value);
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const durableObject = new WorkspaceYDocDurableObject(state, createEnv());
    const ws = createWebSocket();
    const sourceDoc = new Y.Doc();
    sourceDoc.getMap('meta').set('schemaVersion', 1);
    const recoveryState = sourceDoc.getMap('recovery');
    recoveryState.set('first', true);
    const firstUpdate = Y.encodeStateAsUpdate(sourceDoc);
    const firstStateVector = Y.encodeStateVector(sourceDoc);

    await expect(
      durableObject.webSocketMessage(
        ws,
        toArrayBuffer(
          encodeWorkspaceYDocSyncMessage((encoder) =>
            syncProtocol.writeUpdate(encoder, firstUpdate),
          ),
        ),
      ),
    ).rejects.toThrow('storage temporarily unavailable');

    recoveryState.set('second', true);
    const secondUpdate = Y.encodeStateAsUpdate(sourceDoc, firstStateVector);
    await durableObject.webSocketMessage(
      ws,
      toArrayBuffer(
        encodeWorkspaceYDocSyncMessage((encoder) =>
          syncProtocol.writeUpdate(encoder, secondUpdate),
        ),
      ),
    );

    const coldObject = new WorkspaceYDocDurableObject(state, createEnv());
    const response = await coldObject.fetch(createRequest('/api/workspaces/ws-1/yjs/state'));
    const restoredDoc = new Y.Doc();
    Y.applyUpdate(restoredDoc, new Uint8Array(await response.arrayBuffer()));
    expect(restoredDoc.getMap('recovery').toJSON()).toEqual({ first: true, second: true });
  });

  it.each(['import', 'migrate'])('rejects %s when its D1 checkpoint fails', async (operation) => {
    vi.doMock('../../lib/workspaceEntities.js', () => ({
      checkpointWorkspaceSnapshotEntities: vi
        .fn()
        .mockRejectedValue(new Error('checkpoint unavailable')),
      getWorkspaceSnapshotForWorkspace: vi.fn().mockResolvedValue({
        globalDraft: null,
        drafts: [],
        savedTables: [],
        savedDrafts: [],
        folders: [],
      }),
    }));
    const { WorkspaceYDocDurableObject } = await import('../../lib/workspaceYDocDurableObject.js');
    const { state, store } = createDurableObjectState();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const durableObject = new WorkspaceYDocDurableObject(state, createEnv());

    await expect(
      durableObject.fetch(
        createRequest(`/api/workspaces/ws-1/yjs/${operation}`, {
          method: 'POST',
          body: JSON.stringify(createSnapshot('users')),
        }),
      ),
    ).rejects.toThrow('checkpoint unavailable');
    expect(store.get('meta')).toEqual(
      expect.objectContaining({
        checkpointFailedAt: expect.any(Number),
      }),
    );
  });

  it('keeps constructor light and defers storage reads until an event', async () => {
    vi.doMock('../../lib/workspaceEntities.js', () => ({
      checkpointWorkspaceSnapshotEntities: vi.fn(),
      getWorkspaceSnapshotForWorkspace: vi.fn().mockResolvedValue({
        globalDraft: null,
        drafts: [],
        savedTables: [],
        savedDrafts: [],
        folders: [],
      }),
    }));
    const { WorkspaceYDocDurableObject } = await import('../../lib/workspaceYDocDurableObject.js');
    const { state } = createDurableObjectState();

    new WorkspaceYDocDurableObject(state, createEnv());

    expect(state.storage.get).not.toHaveBeenCalled();
    expect(state.storage.list).not.toHaveBeenCalled();
    expect(state.storage.put).not.toHaveBeenCalled();
  });

  it('logs compact health metrics without per-update events or user identity', async () => {
    vi.doMock('../../lib/workspaceEntities.js', () => ({
      checkpointWorkspaceSnapshotEntities: vi.fn().mockResolvedValue({
        cursor: 1,
        upserted: 1,
        deleted: 0,
        skipped: 0,
      }),
      getWorkspaceSnapshotForWorkspace: vi.fn().mockResolvedValue({
        globalDraft: null,
        drafts: [],
        savedTables: [],
        savedDrafts: [],
        folders: [],
      }),
    }));
    const { WorkspaceYDocDurableObject } = await import('../../lib/workspaceYDocDurableObject.js');
    const { state } = createDurableObjectState();
    const durableObject = new WorkspaceYDocDurableObject(state, createEnv());

    const response = await durableObject.fetch(
      createRequest('/api/workspaces/ws-1/yjs/import', {
        method: 'POST',
        body: JSON.stringify(createSnapshot('users')),
      }),
    );

    const logs = (
      console.info as unknown as { mock: { calls: Array<[unknown, ...unknown[]]> } }
    ).mock.calls.map((call) => JSON.parse(String(call[0])) as Record<string, unknown>);
    expect(response.status).toBe(200);
    expect(logs).not.toContainEqual(expect.objectContaining({ operation: 'update' }));
    expect(logs).toContainEqual(
      expect.objectContaining({
        event: 'workspace_yjs_do_health',
        operation: 'compact',
        workspaceId: 'ws-1',
        compactCount: 1,
        compactedUpdateCount: 1,
        checkpointed: true,
      }),
    );
    expect(logs.some((payload) => 'userId' in payload)).toBe(false);
  });

  it('broadcasts one message for one merged update batch', async () => {
    vi.doMock('../../lib/workspaceEntities.js', () => ({
      checkpointWorkspaceSnapshotEntities: vi.fn(),
      getWorkspaceSnapshotForWorkspace: vi.fn().mockResolvedValue({
        globalDraft: null,
        drafts: [],
        savedTables: [],
        savedDrafts: [],
        folders: [],
      }),
    }));
    vi.stubGlobal('WebSocket', { OPEN: 1 });
    const { WorkspaceYDocDurableObject } = await import('../../lib/workspaceYDocDurableObject.js');
    const { state } = createDurableObjectState();
    const origin = createWebSocket();
    const peer = createWebSocket();
    vi.mocked(state.getWebSockets).mockReturnValue([origin, peer]);
    const durableObject = new WorkspaceYDocDurableObject(state, createEnv());
    const sourceDoc = new Y.Doc();
    const updates: Uint8Array[] = [];
    sourceDoc.on('update', (update) => updates.push(update));
    sourceDoc.getMap('meta').set('schemaVersion', 1);

    const fields = sourceDoc.getMap('fields');
    for (let index = 0; index < 50; index += 1) {
      fields.set(`field-${index}`, `value-${index}`);
    }
    const mergedUpdate = Y.mergeUpdates(updates);

    await durableObject.webSocketMessage(
      origin,
      toArrayBuffer(
        encodeWorkspaceYDocSyncMessage((encoder) =>
          syncProtocol.writeUpdate(encoder, mergedUpdate),
        ),
      ),
    );

    await Promise.all(vi.mocked(state.waitUntil).mock.calls.map(([promise]) => promise));
    expect(peer.send).toHaveBeenCalledTimes(1);
    expect(origin.send).not.toHaveBeenCalled();
  });

  it('restores an empty Durable Object from D1 snapshot on cold start', async () => {
    const getWorkspaceSnapshotForWorkspace = vi.fn().mockResolvedValue(createSnapshot('restored'));
    const checkpointWorkspaceSnapshotEntities = vi.fn();
    vi.doMock('../../lib/workspaceEntities.js', () => ({
      checkpointWorkspaceSnapshotEntities,
      getWorkspaceSnapshotForWorkspace,
    }));
    const { WorkspaceYDocDurableObject } = await import('../../lib/workspaceYDocDurableObject.js');
    const { exportWorkspaceYDocToSnapshot } = await import('@ddlbuilder/workspace-core');
    const { state } = createDurableObjectState();
    const durableObject = new WorkspaceYDocDurableObject(state, createEnv());

    const response = await durableObject.fetch(createRequest('/api/workspaces/ws-1/yjs/state'));
    const doc = new Y.Doc();
    Y.applyUpdate(doc, new Uint8Array(await response.arrayBuffer()));

    expect(getWorkspaceSnapshotForWorkspace).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      'ws-1',
    );
    expect(exportWorkspaceYDocToSnapshot(doc).drafts[0]?.state.tableName).toBe('restored');
    expect(checkpointWorkspaceSnapshotEntities).not.toHaveBeenCalled();
  });

  it('serves compacted state through a sync step after Durable Object cold start', async () => {
    vi.doMock('../../lib/workspaceEntities.js', () => ({
      checkpointWorkspaceSnapshotEntities: vi.fn().mockResolvedValue({
        cursor: 1,
        upserted: 1,
        deleted: 0,
        skipped: 0,
      }),
      getWorkspaceSnapshotForWorkspace: vi.fn().mockResolvedValue({
        globalDraft: null,
        drafts: [],
        savedTables: [],
        savedDrafts: [],
        folders: [],
      }),
    }));
    vi.stubGlobal('WebSocket', { OPEN: 1 });
    const { WorkspaceYDocDurableObject } = await import('../../lib/workspaceYDocDurableObject.js');
    const { exportWorkspaceYDocToSnapshot } = await import('@ddlbuilder/workspace-core');
    const sharedStore = new Map<string, unknown>();
    const firstState = createDurableObjectState(sharedStore).state;
    const firstObject = new WorkspaceYDocDurableObject(firstState, createEnv());
    await firstObject.fetch(
      createRequest('/api/workspaces/ws-1/yjs/import', {
        method: 'POST',
        body: JSON.stringify(createSnapshot('compacted')),
      }),
    );

    const secondState = createDurableObjectState(sharedStore).state;
    const secondObject = new WorkspaceYDocDurableObject(secondState, createEnv());
    const clientDoc = new Y.Doc();
    const sent: Uint8Array[] = [];
    const clientSocket = createWebSocket();
    clientSocket.send.mockImplementation((message: Uint8Array) => {
      sent.push(message);
    });

    await secondObject.webSocketMessage(
      clientSocket,
      toArrayBuffer(
        encodeWorkspaceYDocSyncMessage((encoder) =>
          syncProtocol.writeSyncStep1(encoder, clientDoc),
        ),
      ),
    );

    const response = sent[0];
    expect(response).toBeDefined();
    const decoder = decoding.createDecoder(response);
    expect(readWorkspaceYDocMessageHeader(decoder)).toEqual({ kind: 'sync' });
    encodeWorkspaceYDocSyncMessage((encoder) => {
      syncProtocol.readSyncMessage(decoder, encoder, clientDoc, null);
    });

    expect(exportWorkspaceYDocToSnapshot(clientDoc).drafts[0]?.state.tableName).toBe('compacted');
  });

  it('restores workspace identity from hibernated websocket attachments', async () => {
    const getWorkspaceSnapshotForWorkspace = vi.fn().mockResolvedValue(createSnapshot('attached'));
    vi.doMock('../../lib/workspaceEntities.js', () => ({
      checkpointWorkspaceSnapshotEntities: vi.fn(),
      getWorkspaceSnapshotForWorkspace,
    }));
    vi.stubGlobal('WebSocket', { OPEN: 1 });
    const { WorkspaceYDocDurableObject } = await import('../../lib/workspaceYDocDurableObject.js');
    const { exportWorkspaceYDocToSnapshot } = await import('@ddlbuilder/workspace-core');
    const { state } = createDurableObjectState();
    const durableObject = new WorkspaceYDocDurableObject(state, createEnv());
    const clientDoc = new Y.Doc();
    const socket = createWebSocket({
      schemaVersion: 1,
      socketId: 'socket-1',
      workspaceId: 'ws-1',
      userId: 'user-1',
      sessionId: 'session-1',
      connectedAt: 1,
    });

    await durableObject.webSocketMessage(
      socket,
      toArrayBuffer(
        encodeWorkspaceYDocSyncMessage((encoder) =>
          syncProtocol.writeSyncStep1(encoder, clientDoc),
        ),
      ),
    );

    const sent = socket.send.mock.calls[0]?.[0] as Uint8Array | undefined;
    expect(sent).toBeDefined();
    if (!sent) {
      throw new Error('Expected sync response');
    }
    const decoder = decoding.createDecoder(sent);
    expect(readWorkspaceYDocMessageHeader(decoder)).toEqual({ kind: 'sync' });
    encodeWorkspaceYDocSyncMessage((encoder) => {
      syncProtocol.readSyncMessage(decoder, encoder, clientDoc, null);
    });

    expect(getWorkspaceSnapshotForWorkspace).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      'ws-1',
    );
    expect(exportWorkspaceYDocToSnapshot(clientDoc).drafts[0]?.state.tableName).toBe('attached');
  });

  it('keeps compact alarm idempotent across repeated calls and cold start', async () => {
    vi.doMock('../../lib/workspaceEntities.js', () => ({
      checkpointWorkspaceSnapshotEntities: vi.fn().mockResolvedValue({
        cursor: 1,
        upserted: 1,
        deleted: 0,
        skipped: 0,
      }),
      getWorkspaceSnapshotForWorkspace: vi.fn().mockResolvedValue({
        globalDraft: null,
        drafts: [],
        savedTables: [],
        savedDrafts: [],
        folders: [],
      }),
    }));
    const { WorkspaceYDocDurableObject } = await import('../../lib/workspaceYDocDurableObject.js');
    const { exportWorkspaceYDocToSnapshot } = await import('@ddlbuilder/workspace-core');
    const sharedStore = new Map<string, unknown>();
    const firstObject = new WorkspaceYDocDurableObject(
      createDurableObjectState(sharedStore).state,
      createEnv(),
    );
    await firstObject.fetch(
      createRequest('/api/workspaces/ws-1/yjs/import', {
        method: 'POST',
        body: JSON.stringify(createSnapshot('alarm_safe')),
      }),
    );

    await firstObject.alarm();
    await firstObject.alarm();
    const secondObject = new WorkspaceYDocDurableObject(
      createDurableObjectState(sharedStore).state,
      createEnv(),
    );
    await secondObject.alarm();

    const response = await secondObject.fetch(createRequest('/api/workspaces/ws-1/yjs/state'));
    const doc = new Y.Doc();
    Y.applyUpdate(doc, new Uint8Array(await response.arrayBuffer()));
    expect(exportWorkspaceYDocToSnapshot(doc).drafts[0]?.state.tableName).toBe('alarm_safe');
  });

  it('keeps compaction counters consistent when requests overlap', async () => {
    vi.doMock('../../lib/workspaceEntities.js', () => ({
      checkpointWorkspaceSnapshotEntities: vi.fn(),
      getWorkspaceSnapshotForWorkspace: vi.fn().mockResolvedValue({
        globalDraft: null,
        drafts: [],
        savedTables: [],
        savedDrafts: [],
        folders: [],
      }),
    }));
    const { WorkspaceYDocDurableObject } = await import('../../lib/workspaceYDocDurableObject.js');
    const { state, store } = createDurableObjectState();
    const object = new WorkspaceYDocDurableObject(state, createEnv());
    const source = new Y.Doc();
    source.getMap('fields').set('name', 'users');
    await object.webSocketMessage(
      createWebSocket(),
      trackedUpdate(Y.encodeStateAsUpdate(source), 1),
    );
    await Promise.all(
      [1, 2].map(() => object.fetch(createRequest('/compact', { method: 'POST' }))),
    );
    expect(store.get('meta')).toMatchObject({ updateCount: 0, updateBytes: 0 });
    source.destroy();
  });

  it('does not reschedule an alarm after all updates are checkpointed', async () => {
    vi.doMock('../../lib/workspaceEntities.js', () => ({
      checkpointWorkspaceSnapshotEntities: vi.fn().mockResolvedValue({
        cursor: 1,
        upserted: 1,
        deleted: 0,
        skipped: 0,
      }),
      getWorkspaceSnapshotForWorkspace: vi.fn().mockResolvedValue({
        globalDraft: null,
        drafts: [],
        savedTables: [],
        savedDrafts: [],
        folders: [],
      }),
    }));
    const { WorkspaceYDocDurableObject } = await import('../../lib/workspaceYDocDurableObject.js');
    const { state } = createDurableObjectState();
    const durableObject = new WorkspaceYDocDurableObject(state, createEnv());
    await durableObject.fetch(
      createRequest('/api/workspaces/ws-1/yjs/import', {
        method: 'POST',
        body: JSON.stringify(createSnapshot('alarm_done')),
      }),
    );
    vi.mocked(state.storage.setAlarm).mockClear();

    await durableObject.alarm();

    expect(state.storage.setAlarm).not.toHaveBeenCalled();
  });

  it('schedules a durable retry when automatic alarm retries are exhausted', async () => {
    vi.doMock('../../lib/workspaceEntities.js', () => ({
      checkpointWorkspaceSnapshotEntities: vi
        .fn()
        .mockRejectedValue(new Error('checkpoint unavailable')),
      getWorkspaceSnapshotForWorkspace: vi.fn().mockResolvedValue({
        globalDraft: null,
        drafts: [],
        savedTables: [],
        savedDrafts: [],
        folders: [],
      }),
    }));
    const { WorkspaceYDocDurableObject } = await import('../../lib/workspaceYDocDurableObject.js');
    const { state } = createDurableObjectState();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const durableObject = new WorkspaceYDocDurableObject(state, createEnv());
    await expect(
      durableObject.fetch(
        createRequest('/api/workspaces/ws-1/yjs/import', {
          method: 'POST',
          body: JSON.stringify(createSnapshot('alarm_retry')),
        }),
      ),
    ).rejects.toThrow('checkpoint unavailable');
    vi.mocked(state.storage.setAlarm).mockClear();

    await durableObject.alarm({
      isRetry: true,
      retryCount: 5,
      scheduledTime: Date.now(),
    });

    expect(state.storage.setAlarm).toHaveBeenCalledTimes(1);
  });

  it('logs websocket close and error with attachment identity', async () => {
    vi.doMock('../../lib/workspaceEntities.js', () => ({
      checkpointWorkspaceSnapshotEntities: vi.fn(),
      getWorkspaceSnapshotForWorkspace: vi.fn().mockResolvedValue({
        globalDraft: null,
        drafts: [],
        savedTables: [],
        savedDrafts: [],
        folders: [],
      }),
    }));
    const { WorkspaceYDocDurableObject } = await import('../../lib/workspaceYDocDurableObject.js');
    const durableObject = new WorkspaceYDocDurableObject(
      createDurableObjectState().state,
      createEnv(),
    );
    const socket = createWebSocket({
      schemaVersion: 1,
      workspaceId: 'ws-1',
      userId: 'user-1',
      sessionId: 'session-1',
    });

    await durableObject.webSocketClose(socket, 1000, 'done', true);
    await durableObject.webSocketError(socket, new Error('network failed'));

    const logs = (
      console.info as unknown as { mock: { calls: Array<[unknown, ...unknown[]]> } }
    ).mock.calls.map((call) => JSON.parse(String(call[0])) as Record<string, unknown>);
    expect(logs).toContainEqual(
      expect.objectContaining({
        event: 'workspace_yjs_do_health',
        operation: 'close',
        workspaceId: 'ws-1',
        closeCode: 1000,
        wasClean: true,
      }),
    );
    expect(logs).toContainEqual(
      expect.objectContaining({
        event: 'workspace_yjs_do_health',
        operation: 'error',
        workspaceId: 'ws-1',
        errorMessage: 'network failed',
      }),
    );
    expect(logs.some((payload) => 'userId' in payload)).toBe(false);
  });

  it('kick closes only the matching session and clears the authorization cache', async () => {
    const { WorkspaceYDocDurableObject } = await import('../../lib/workspaceYDocDurableObject.js');
    const { state, store } = createDurableObjectState();
    let authQueries = 0;
    const prepare = vi.fn(() => {
      if (String(prepare.mock.calls.length)) {
        // 每次调用前累加，用于区分鉴权查询
      }
      authQueries += 1;
      return {
        bind: () => ({ all: async () => ({ results: [{ id: 'session-1' }] }) }),
      };
    });
    const durableObject = new WorkspaceYDocDurableObject(state, {
      USER_DB: { prepare },
    } as unknown as ApiEnv['Bindings']);
    const matching = createWebSocket({
      schemaVersion: 1,
      workspaceId: 'ws-1',
      userId: 'user-1',
      sessionId: 'session-1',
    });
    const other = createWebSocket({
      schemaVersion: 1,
      workspaceId: 'ws-1',
      userId: 'user-2',
      sessionId: 'session-2',
    });
    vi.mocked(state.getWebSockets).mockReturnValue([matching, other]);

    const kick = await durableObject.fetch(
      new Request('http://localhost/kick', {
        method: 'POST',
        headers: {
          'x-ddlbuilder-user-id': 'user-1',
          'x-ddlbuilder-session-id': 'session-1',
        },
      }),
    );
    expect(kick.status).toBe(200);
    expect(matching.close).toHaveBeenCalledWith(1008, 'Session revoked');
    expect(other.close).not.toHaveBeenCalled();

    // 缓存已失效：下一条消息会重新鉴权
    const doc = new Y.Doc();
    doc.getMap('meta').set('schemaVersion', 1);
    store.set('snapshot', Y.encodeStateAsUpdate(doc));
    await durableObject.webSocketMessage(matching, trackedUpdate(Y.encodeStateAsUpdate(doc), 1));
    expect(authQueries).toBe(1);
    doc.destroy();
  });
});
