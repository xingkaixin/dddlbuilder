import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import { WORKSPACE_SYNC_MESSAGE } from '@ddlbuilder/shared-types';
import {
  WORKSPACE_YDOC_CONNECT_TIMEOUT_MS,
  WORKSPACE_YDOC_UPDATE_BATCH_MS,
  WorkspaceYDocSyncClient,
  type WorkspaceYDocConnectionStatus,
} from '@/services/workspaceYDocSyncClient';

const MESSAGE_SYNC = 0;

const encodeSyncMessage = (write: (encoder: encoding.Encoder) => void) => {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  write(encoder);
  return encoding.toUint8Array(encoder);
};

const applySyncMessage = (doc: Y.Doc, message: ArrayBuffer) => {
  const decoder = decodeSyncMessage(message);
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  syncProtocol.readSyncMessage(decoder, encoder, doc, null);
};

const respondToSyncMessage = (doc: Y.Doc, message: ArrayBuffer) => {
  const decoder = decodeSyncMessage(message);
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  syncProtocol.readSyncMessage(decoder, encoder, doc, null);
  return encoding.length(encoder) > 1 ? encoding.toUint8Array(encoder) : null;
};

const decodeSyncMessage = (message: ArrayBuffer) => {
  const decoder = decoding.createDecoder(new Uint8Array(message));
  let type = decoding.readVarUint(decoder);
  if (type === WORKSPACE_SYNC_MESSAGE.syncWithAck) {
    decoding.readVarUint(decoder);
    type = decoding.readVarUint(decoder);
  }
  expect(type).toBe(MESSAGE_SYNC);
  return decoder;
};

const acknowledge = (socket: MockWebSocket, message: ArrayBuffer) => {
  const decoder = decoding.createDecoder(new Uint8Array(message));
  if (decoding.readVarUint(decoder) !== WORKSPACE_SYNC_MESSAGE.syncWithAck) return;
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, WORKSPACE_SYNC_MESSAGE.persisted);
  encoding.writeVarUint(encoder, decoding.readVarUint(decoder));
  socket.receive(encoding.toUint8Array(encoder));
};

const syncWithServer = (socket: MockWebSocket, serverDoc: Y.Doc) => {
  socket.receive(encodeSyncMessage((encoder) => syncProtocol.writeSyncStep1(encoder, serverDoc)));
  for (const message of socket.sent) {
    const response = respondToSyncMessage(serverDoc, message);
    if (response) socket.receive(response);
    acknowledge(socket, message);
  }
};

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readonly url: string;
  binaryType = '';
  readyState = MockWebSocket.CONNECTING;
  sent: ArrayBuffer[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: ArrayBuffer) {
    this.sent.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  open() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  receive(data: Uint8Array) {
    this.onmessage?.({ data: data.buffer });
  }
}

const firstSocket = () => {
  const socket = MockWebSocket.instances[0];
  expect(socket).toBeDefined();
  return socket as MockWebSocket;
};

const sentMessage = (socket: MockWebSocket, index: number) => {
  const message = socket.sent[index];
  expect(message).toBeInstanceOf(ArrayBuffer);
  return message as ArrayBuffer;
};

describe('WorkspaceYDocSyncClient', () => {
  it('notifies only when connection status changes during an edit burst', async () => {
    const doc = new Y.Doc();
    const server = new Y.Doc();
    const status = vi.fn();
    const client = new WorkspaceYDocSyncClient('ws', doc, status);
    await client.connect();
    const socket = firstSocket();
    socket.open();
    syncWithServer(socket, server);
    status.mockClear();
    for (let i = 0; i < 10; i += 1) doc.getMap('test').set('value', i);
    const calls = status.mock.calls.length;
    client.destroy();
    doc.destroy();
    server.destroy();
    expect(calls).toBe(1);
  });

  it('materializes a remote snapshot with a distinct origin and sends the resulting delta', async () => {
    const doc = new Y.Doc();
    const serverDoc = new Y.Doc();
    const draft = new Y.Map();
    serverDoc.getMap('drafts').set('draft-1', draft);
    draft.set('stateSnapshot', {
      tableName: 'remote',
      dbType: 'mysql',
      rows: [{ id: 'field', fieldName: 'id', fieldType: 'int', nullable: false }],
    });
    const origins: unknown[] = [];
    doc.on('update', (_update, origin) => origins.push(origin));
    const client = new WorkspaceYDocSyncClient('ws', doc, vi.fn());
    await client.connect();
    const socket = firstSocket();
    socket.open();
    syncWithServer(socket, serverDoc);
    expect(origins).toContain('workspace-remote-sync');
    expect(origins).toContain('workspace-remote-materialize');
    expect(origins).not.toContain('workspace-local-edit');
    expect(draft.get('fields')).toBeInstanceOf(Y.Map);
    client.destroy();
    doc.destroy();
    serverDoc.destroy();
  });
  it('opens with only a state-vector request, without a full document update', async () => {
    const doc = new Y.Doc();
    doc.getMap('fields').set('large', 'x'.repeat(100_000));
    const client = new WorkspaceYDocSyncClient('ws', doc, vi.fn());
    await client.connect();
    const socket = firstSocket();
    socket.open();
    expect(socket.sent).toHaveLength(1);
    expect(socket.sent[0].byteLength).toBeLessThan(100);
    client.destroy();
    doc.destroy();
  });
  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('records the 50-field batch sync envelope in one websocket update message', async () => {
    const doc = new Y.Doc();
    const updates: Uint8Array[] = [];
    doc.on('update', (update) => updates.push(update));
    const client = new WorkspaceYDocSyncClient('ws-1', doc, vi.fn());
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});

    await client.connect();
    const socket = firstSocket();
    socket.open();

    const fields = doc.getMap('fields');
    for (let index = 0; index < 50; index += 1) {
      fields.set(`field-${index}`, `value-${index}`);
    }

    vi.advanceTimersByTime(WORKSPACE_YDOC_UPDATE_BATCH_MS - 1);
    expect(socket.sent).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(socket.sent).toHaveLength(2);

    const updateMessage = sentMessage(socket, 1);
    const individualUpdateBytes = updates.reduce((total, update) => total + update.byteLength, 0);
    const metric = JSON.parse(String(info.mock.calls[0]?.[0])) as Record<string, unknown>;

    expect(metric).toMatchObject({
      event: 'workspace_yjs_client_batch',
      workspaceId: 'ws-1',
      updateCount: 50,
      messageBytes: updateMessage.byteLength,
      durationMs: WORKSPACE_YDOC_UPDATE_BATCH_MS,
    });
    expect(socket.sent).toHaveLength(2);
    expect(updateMessage.byteLength).toBeLessThan(individualUpdateBytes);
    expect(metric.updateBytes).toBeLessThan(individualUpdateBytes);

    const peer = new Y.Doc();
    applySyncMessage(peer, updateMessage);
    expect(peer.getMap('fields').size).toBe(50);
    expect(peer.getMap('fields').get('field-49')).toBe('value-49');

    client.destroy();
  });

  it('does not report cloud sync when local updates were only sent', async () => {
    const doc = new Y.Doc();
    const statuses: WorkspaceYDocConnectionStatus[] = [];
    const onConnectionStateChange = vi.fn((status) => statuses.push(status));
    const client = new WorkspaceYDocSyncClient('ws-1', doc, onConnectionStateChange);
    const serverDoc = new Y.Doc();

    await client.connect();
    const socket = firstSocket();
    socket.open();
    expect(statuses.at(-1)).toMatchObject({ state: 'connected', synced: false });

    socket.receive(encodeSyncMessage((encoder) => syncProtocol.writeSyncStep1(encoder, serverDoc)));
    await Promise.resolve();
    console.info('sync status before server persistence', statuses.at(-1));
    expect(statuses.at(-1)).toMatchObject({ state: 'connected', synced: false });

    doc.getMap('fields').set('field-1', 'value-1');
    expect(statuses.at(-1)).toMatchObject({ state: 'connected', synced: false });

    vi.advanceTimersByTime(WORKSPACE_YDOC_UPDATE_BATCH_MS);
    console.info('sync status after send without acknowledgement', statuses.at(-1));
    expect(statuses.at(-1)).toMatchObject({ state: 'connected', synced: false });

    client.destroy();
  });

  it('requires acknowledgements for every batch, including deletions and newer edits', async () => {
    const doc = new Y.Doc();
    const statuses: WorkspaceYDocConnectionStatus[] = [];
    const client = new WorkspaceYDocSyncClient('ws-1', doc, (status) => statuses.push(status));
    await client.connect();
    const socket = firstSocket();
    socket.open();
    const serverDoc = new Y.Doc();
    syncWithServer(socket, serverDoc);
    expect(statuses.at(-1)?.synced).toBe(true);

    const fields = doc.getMap('fields');
    fields.set('first', 'value');
    vi.advanceTimersByTime(WORKSPACE_YDOC_UPDATE_BATCH_MS);
    const firstBatch = sentMessage(socket, socket.sent.length - 1);
    expect(statuses.at(-1)?.synced).toBe(false);
    fields.set('second', 'value');
    acknowledge(socket, firstBatch);
    expect(statuses.at(-1)?.synced).toBe(false);

    vi.advanceTimersByTime(WORKSPACE_YDOC_UPDATE_BATCH_MS);
    acknowledge(socket, firstBatch);
    expect(statuses.at(-1)?.synced).toBe(false);
    acknowledge(socket, sentMessage(socket, socket.sent.length - 1));
    expect(statuses.at(-1)?.synced).toBe(true);

    const vector = Y.encodeStateVector(doc);
    fields.delete('first');
    expect(Y.encodeStateVector(doc)).toEqual(vector);
    vi.advanceTimersByTime(WORKSPACE_YDOC_UPDATE_BATCH_MS);
    expect(statuses.at(-1)?.synced).toBe(false);
    acknowledge(socket, sentMessage(socket, socket.sent.length - 1));
    expect(statuses.at(-1)?.synced).toBe(true);
    client.destroy();
  });

  it('flushes immediately and waits for persisted acknowledgements, including newer edits', async () => {
    const doc = new Y.Doc();
    const server = new Y.Doc();
    const client = new WorkspaceYDocSyncClient('ws-1', doc, vi.fn());
    await client.connect();
    const socket = firstSocket();
    socket.open();
    syncWithServer(socket, server);
    doc.getMap('fields').set('first', 'value');
    let completed = false;
    const pending = client.flushAndWaitForSync().then(() => {
      completed = true;
    });
    const firstBatch = sentMessage(socket, socket.sent.length - 1);
    doc.getMap('fields').set('second', 'value');
    acknowledge(socket, firstBatch);
    await Promise.resolve();
    expect(completed).toBe(false);
    vi.advanceTimersByTime(WORKSPACE_YDOC_UPDATE_BATCH_MS);
    acknowledge(socket, sentMessage(socket, socket.sent.length - 1));
    await pending;
    expect(completed).toBe(true);
    client.destroy();
  });

  it.each(['timeout', 'offline', 'destroy'])(
    'does not permit data cleanup after %s',
    async (failure) => {
      const doc = new Y.Doc();
      const client = new WorkspaceYDocSyncClient('ws-1', doc, vi.fn());
      await client.connect();
      const socket = firstSocket();
      socket.open();
      syncWithServer(socket, new Y.Doc());
      doc.getMap('fields').set('unsynced', 'keep me');
      const pending = client.flushAndWaitForSync().catch((error: unknown) => error);
      if (failure === 'timeout') vi.advanceTimersByTime(WORKSPACE_YDOC_CONNECT_TIMEOUT_MS);
      else if (failure === 'offline') window.dispatchEvent(new Event('offline'));
      else client.destroy();
      expect(await pending).toBeInstanceOf(Error);
      expect(doc.getMap('fields').get('unsynced')).toBe('keep me');
      client.destroy();
    },
  );

  it('does not reuse acknowledgements after retry or reconnect', async () => {
    const doc = new Y.Doc();
    const statuses: WorkspaceYDocConnectionStatus[] = [];
    const client = new WorkspaceYDocSyncClient('ws-1', doc, (status) => statuses.push(status));
    await client.connect();
    const socket = firstSocket();
    socket.open();
    const oldBatch = sentMessage(socket, socket.sent.length - 1);
    client.retry();
    acknowledge(socket, oldBatch);
    expect(statuses.at(-1)?.synced).toBe(false);
    await vi.waitFor(() => expect(MockWebSocket.instances).toHaveLength(2));
    const activeSocket = MockWebSocket.instances[1];
    activeSocket.open();
    acknowledge(socket, oldBatch);
    acknowledge(activeSocket, oldBatch);
    expect(statuses.at(-1)?.synced).toBe(false);
    syncWithServer(activeSocket, new Y.Doc());
    expect(statuses.at(-1)?.synced).toBe(true);
    client.destroy();
  });

  it('recovers an unacknowledged update when returning online on an open socket', async () => {
    const doc = new Y.Doc();
    const server = new Y.Doc();
    const statuses: WorkspaceYDocConnectionStatus[] = [];
    const client = new WorkspaceYDocSyncClient('ws-1', doc, (status) => statuses.push(status));
    await client.connect();
    let socket = firstSocket();
    socket.open();
    syncWithServer(socket, server);
    doc.getMap('fields').set('lost', 'recover');
    vi.advanceTimersByTime(WORKSPACE_YDOC_UPDATE_BATCH_MS);
    const previousCount = socket.sent.length;
    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(MockWebSocket.instances).toHaveLength(2));
    expect(socket.sent).toHaveLength(previousCount);
    socket = MockWebSocket.instances[1];
    socket.open();
    syncWithServer(socket, server);
    expect(server.getMap('fields').get('lost')).toBe('recover');
    expect(statuses.at(-1)?.synced).toBe(true);
    client.destroy();
  });

  it('waits for an idle window before sending queued local updates', async () => {
    const doc = new Y.Doc();
    const client = new WorkspaceYDocSyncClient('ws-1', doc, vi.fn());
    vi.spyOn(console, 'info').mockImplementation(() => {});

    await client.connect();
    const socket = firstSocket();
    socket.open();

    const fields = doc.getMap('fields');
    fields.set('field-1', 'value-1');
    vi.advanceTimersByTime(WORKSPACE_YDOC_UPDATE_BATCH_MS - 1);
    expect(socket.sent).toHaveLength(1);

    fields.set('field-2', 'value-2');
    vi.advanceTimersByTime(1);
    expect(socket.sent).toHaveLength(1);

    vi.advanceTimersByTime(WORKSPACE_YDOC_UPDATE_BATCH_MS);
    expect(socket.sent).toHaveLength(2);

    const peer = new Y.Doc();
    applySyncMessage(peer, sentMessage(socket, 1));
    expect(peer.getMap('fields').get('field-1')).toBe('value-1');
    expect(peer.getMap('fields').get('field-2')).toBe('value-2');

    client.destroy();
  });

  it('keeps offline edits until differential sync when the socket remains open offline', async () => {
    const doc = new Y.Doc();
    const statuses: WorkspaceYDocConnectionStatus[] = [];
    const onConnectionStateChange = vi.fn((status) => statuses.push(status));
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const client = new WorkspaceYDocSyncClient('ws-1', doc, onConnectionStateChange);
    const serverDoc = new Y.Doc();

    await client.connect();
    const socket = firstSocket();
    socket.open();
    socket.receive(encodeSyncMessage((encoder) => syncProtocol.writeSyncStep1(encoder, serverDoc)));
    await Promise.resolve();
    syncWithServer(socket, serverDoc);
    expect(statuses.at(-1)).toMatchObject({ state: 'connected', synced: true });
    const syncedMessageCount = socket.sent.length;

    const onLine = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    window.dispatchEvent(new Event('offline'));
    doc.getMap('fields').set('offline-field', 'offline-value');
    vi.advanceTimersByTime(WORKSPACE_YDOC_UPDATE_BATCH_MS);

    expect(statuses.at(-1)).toMatchObject({ state: 'offline', synced: false });
    expect(socket.sent).toHaveLength(syncedMessageCount);
    expect(info).not.toHaveBeenCalled();

    onLine.mockReturnValue(true);
    window.dispatchEvent(new Event('online'));

    await vi.waitFor(() => expect(MockWebSocket.instances).toHaveLength(2));
    const reconnected = MockWebSocket.instances[1];
    reconnected.open();
    syncWithServer(reconnected, serverDoc);
    expect(serverDoc.getMap('fields').get('offline-field')).toBe('offline-value');

    client.destroy();
  });

  it('uses sync state vectors to converge local offline changes after reconnect', async () => {
    const doc = new Y.Doc();
    doc.getMap('fields').set('offline-field', 'offline-value');
    const client = new WorkspaceYDocSyncClient('ws-1', doc, vi.fn());
    const serverDoc = new Y.Doc();

    await client.connect();
    const socket = firstSocket();
    socket.open();
    socket.receive(encodeSyncMessage((encoder) => syncProtocol.writeSyncStep1(encoder, serverDoc)));
    await Promise.resolve();

    expect(socket.sent.length).toBeGreaterThanOrEqual(2);
    applySyncMessage(serverDoc, sentMessage(socket, 1));
    expect(serverDoc.getMap('fields').get('offline-field')).toBe('offline-value');

    client.destroy();
  });

  it('requests a fresh differential sync when returning online with an open socket', async () => {
    const doc = new Y.Doc();
    doc.getMap('fields').set('local-field', 'local-value');
    const serverDoc = new Y.Doc();
    const client = new WorkspaceYDocSyncClient('ws-1', doc, vi.fn());
    await client.connect();
    const socket = firstSocket();
    socket.open();
    syncWithServer(socket, serverDoc);
    serverDoc.getMap('fields').set('remote-field', 'remote-value');
    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(MockWebSocket.instances).toHaveLength(2));
    const reconnected = MockWebSocket.instances[1];
    reconnected.open();
    syncWithServer(reconnected, serverDoc);
    expect(doc.getMap('fields').get('remote-field')).toBe('remote-value');
    expect(serverDoc.getMap('fields').get('local-field')).toBe('local-value');
    client.destroy();
    doc.destroy();
    serverDoc.destroy();
  });

  it('ignores callbacks from a connecting socket replaced after returning online', async () => {
    const doc = new Y.Doc();
    const statuses: WorkspaceYDocConnectionStatus[] = [];
    const client = new WorkspaceYDocSyncClient('ws-1', doc, (status) => statuses.push(status));

    await client.connect();
    const replacedSocket = firstSocket();

    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(MockWebSocket.instances).toHaveLength(2));
    const activeSocket = MockWebSocket.instances[1] as MockWebSocket;
    activeSocket.open();
    expect(statuses.at(-1)).toMatchObject({ state: 'connected' });

    replacedSocket.close();

    expect(statuses.at(-1)).toMatchObject({ state: 'connected' });
    client.destroy();
  });

  it('reports auth and service failures before opening a websocket', async () => {
    const doc = new Y.Doc();
    const onConnectionStateChange = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 401 }))
        .mockResolvedValueOnce(new Response(null, { status: 503 })),
    );

    const authClient = new WorkspaceYDocSyncClient('ws-1', doc, onConnectionStateChange);
    await authClient.connect();
    expect(onConnectionStateChange).toHaveBeenLastCalledWith({
      state: 'error',
      failureReason: 'auth',
      synced: false,
    });
    expect(MockWebSocket.instances).toHaveLength(0);
    authClient.destroy();

    const serviceClient = new WorkspaceYDocSyncClient('ws-1', doc, onConnectionStateChange);
    await serviceClient.connect();
    expect(onConnectionStateChange).toHaveBeenLastCalledWith({
      state: 'error',
      failureReason: 'service_unavailable',
      synced: false,
    });
    expect(MockWebSocket.instances).toHaveLength(0);
    serviceClient.destroy();
  });

  it('retries with the existing client after a failed preflight', async () => {
    const doc = new Y.Doc();
    const onConnectionStateChange = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockRejectedValueOnce(new TypeError('failed'))
        .mockResolvedValueOnce(new Response(null, { status: 204 })),
    );
    const client = new WorkspaceYDocSyncClient('ws-1', doc, onConnectionStateChange);

    await client.connect();
    expect(onConnectionStateChange).toHaveBeenLastCalledWith({
      state: 'error',
      failureReason: 'network',
      synced: false,
    });
    expect(MockWebSocket.instances).toHaveLength(0);

    client.retry();
    await vi.waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    client.destroy();
  });

  it('fails fast when the availability preflight hangs', async () => {
    const doc = new Y.Doc();
    const statuses: WorkspaceYDocConnectionStatus[] = [];
    const onConnectionStateChange = vi.fn((status) => statuses.push(status));
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));
    const client = new WorkspaceYDocSyncClient('ws-1', doc, onConnectionStateChange);

    const connectPromise = client.connect();
    expect(statuses.at(-1)).toMatchObject({ state: 'connecting', synced: false });

    await vi.advanceTimersByTimeAsync(WORKSPACE_YDOC_CONNECT_TIMEOUT_MS);
    await connectPromise;

    expect(statuses.at(-1)).toMatchObject({
      state: 'error',
      failureReason: 'network',
      synced: false,
    });
    expect(MockWebSocket.instances).toHaveLength(0);

    client.destroy();
  });

  it('fails fast when the websocket handshake hangs', async () => {
    const doc = new Y.Doc();
    const statuses: WorkspaceYDocConnectionStatus[] = [];
    const onConnectionStateChange = vi.fn((status) => statuses.push(status));
    const client = new WorkspaceYDocSyncClient('ws-1', doc, onConnectionStateChange);

    await client.connect();
    const socket = firstSocket();
    expect(statuses.at(-1)).toMatchObject({ state: 'connecting', synced: false });

    await vi.advanceTimersByTimeAsync(WORKSPACE_YDOC_CONNECT_TIMEOUT_MS);

    expect(statuses.at(-1)).toMatchObject({
      state: 'error',
      failureReason: 'network',
      synced: false,
    });
    expect(socket.readyState).toBe(MockWebSocket.CLOSED);

    client.destroy();
  });
});
