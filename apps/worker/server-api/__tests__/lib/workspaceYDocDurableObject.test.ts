import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { WorkspaceSnapshot } from '@ddlbuilder/shared-types/workspace';
import type { ApiEnv } from '../../lib/context.js';

const MESSAGE_SYNC = 0;

const encodeSyncMessage = (write: (encoder: encoding.Encoder) => void) => {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  write(encoder);
  return encoding.toUint8Array(encoder);
};

const toArrayBuffer = (bytes: Uint8Array) =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

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
  indexInput: '',
  currentIndexFields: [],
  indexes: [],
  authInput: '',
  authObjects: [],
  foreignKeys: [],
});

const createSnapshot = (tableName: string): WorkspaceSnapshot => ({
  globalDraft: null,
  drafts: [
    {
      draftId: 'default',
      state: createState(tableName),
      createdAt: 1,
      updatedAt: 2,
    },
  ],
  savedTables: [],
  savedDrafts: [],
  folders: [],
});

const createDurableObjectState = (store = new Map<string, unknown>()) => {
  return {
    state: {
      storage: {
        get: vi.fn(async (key: string) => store.get(key)),
        put: vi.fn(async (key: string, value: unknown) => {
          store.set(key, value);
        }),
        delete: vi.fn(async (key: string) => {
          store.delete(key);
          return true;
        }),
        list: vi.fn(async (options?: { prefix?: string }) => {
          const entries = Array.from(store.entries()).filter(
            ([key]) => !options?.prefix || key.startsWith(options.prefix),
          );
          return new Map(entries);
        }),
        getAlarm: vi.fn(async () => null),
        setAlarm: vi.fn(async () => undefined),
      },
      acceptWebSocket: vi.fn(),
      getWebSockets: vi.fn(() => []),
    } as unknown as DurableObjectState,
    store,
  };
};

const createEnv = (): ApiEnv['Bindings'] =>
  ({
    USER_DB: {} as D1Database,
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
  attachment?: unknown,
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

  it('rejects an import when Durable Object storage cannot persist its update', async () => {
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
        createRequest('/api/workspaces/ws-1/yjs/import', {
          method: 'POST',
          body: JSON.stringify(createSnapshot('users')),
        }),
      ),
    ).rejects.toThrow('storage unavailable');
    expect(error).toHaveBeenCalledWith(
      '[workspace-yjs-do] persist failed',
      expect.objectContaining({ message: 'storage unavailable' }),
    );
  });

  it('rejects an import when its D1 checkpoint fails', async () => {
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
        createRequest('/api/workspaces/ws-1/yjs/import', {
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

  it('logs update and compact health metrics', async () => {
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
    expect(logs).toContainEqual(
      expect.objectContaining({
        event: 'workspace_yjs_do_health',
        operation: 'update',
        workspaceId: 'ws-1',
        userId: 'user-1',
        updateCount: 1,
        connectedSockets: 0,
      }),
    );
    expect(logs).toContainEqual(
      expect.objectContaining({
        event: 'workspace_yjs_do_health',
        operation: 'compact',
        workspaceId: 'ws-1',
        userId: 'user-1',
        compactCount: 1,
        compactedUpdateCount: 1,
        checkpointed: true,
      }),
    );
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
    const origin = { readyState: 1, send: vi.fn() } as unknown as WebSocket;
    const peer = { readyState: 1, send: vi.fn() } as unknown as WebSocket;
    vi.mocked(state.getWebSockets).mockReturnValue([origin, peer]);
    const durableObject = new WorkspaceYDocDurableObject(state, createEnv());
    const sourceDoc = new Y.Doc();
    const updates: Uint8Array[] = [];
    sourceDoc.on('update', (update) => updates.push(update));

    const fields = sourceDoc.getMap('fields');
    for (let index = 0; index < 50; index += 1) {
      fields.set(`field-${index}`, `value-${index}`);
    }
    const mergedUpdate = Y.mergeUpdates(updates);

    await durableObject.webSocketMessage(
      origin,
      toArrayBuffer(
        encodeSyncMessage((encoder) => syncProtocol.writeUpdate(encoder, mergedUpdate)),
      ),
    );

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
    const clientSocket = {
      readyState: 1,
      send: vi.fn((message: Uint8Array) => {
        sent.push(message);
      }),
    } as unknown as WebSocket;

    await secondObject.webSocketMessage(
      clientSocket,
      toArrayBuffer(
        encodeSyncMessage((encoder) => syncProtocol.writeSyncStep1(encoder, clientDoc)),
      ),
    );

    const response = sent[0];
    expect(response).toBeDefined();
    const decoder = decoding.createDecoder(response);
    expect(decoding.readVarUint(decoder)).toBe(MESSAGE_SYNC);
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.readSyncMessage(decoder, encoder, clientDoc, null);

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
      connectedAt: 1,
    });

    await durableObject.webSocketMessage(
      socket,
      toArrayBuffer(
        encodeSyncMessage((encoder) => syncProtocol.writeSyncStep1(encoder, clientDoc)),
      ),
    );

    const sent = socket.send.mock.calls[0]?.[0] as Uint8Array | undefined;
    expect(sent).toBeDefined();
    if (!sent) {
      throw new Error('Expected sync response');
    }
    const decoder = decoding.createDecoder(sent);
    expect(decoding.readVarUint(decoder)).toBe(MESSAGE_SYNC);
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.readSyncMessage(decoder, encoder, clientDoc, null);

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
      socketId: 'socket-1',
      workspaceId: 'ws-1',
      userId: 'user-1',
      connectedAt: 1,
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
        userId: 'user-1',
        closeCode: 1000,
        wasClean: true,
      }),
    );
    expect(logs).toContainEqual(
      expect.objectContaining({
        event: 'workspace_yjs_do_health',
        operation: 'error',
        workspaceId: 'ws-1',
        userId: 'user-1',
        errorMessage: 'network failed',
      }),
    );
  });
});
