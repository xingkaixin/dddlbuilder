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
    const { exportWorkspaceYDocToSnapshot } = await import('../../lib/workspaceYDocSnapshot.js');
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
    const { exportWorkspaceYDocToSnapshot } = await import('../../lib/workspaceYDocSnapshot.js');
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
});
