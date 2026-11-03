import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as decoding from 'lib0/decoding';
import {
  encodeWorkspaceYDocAcknowledgement,
  encodeWorkspaceYDocSyncMessage,
  readWorkspaceYDocMessageHeader,
} from '@ddlbuilder/workspace-core';
import {
  WORKSPACE_YDOC_CONNECT_TIMEOUT_MS,
  WORKSPACE_YDOC_UPDATE_BATCH_MS,
  WorkspaceYDocSyncClient,
  type WorkspaceYDocConnectionStatus,
} from '@/services/workspaceYDocSyncClient';

const respondToSyncMessage = (doc: Y.Doc, message: ArrayBuffer) => {
  const decoder = decodeSyncMessage(message);

  const response = encodeWorkspaceYDocSyncMessage((encoder) => {
    syncProtocol.readSyncMessage(decoder, encoder, doc, null);
  });

  return response.byteLength > 1 ? response : null;
};

const decodeSyncMessage = (message: ArrayBuffer) => {
  const decoder = decoding.createDecoder(new Uint8Array(message));
  expect(readWorkspaceYDocMessageHeader(decoder).kind).toBe('sync');

  return decoder;
};

const acknowledge = (socket: MockWebSocket, message: ArrayBuffer) => {
  const decoder = decoding.createDecoder(new Uint8Array(message));
  const header = readWorkspaceYDocMessageHeader(decoder);

  if (header.kind !== 'sync' || header.requestId === undefined) return;
  socket.receive(encodeWorkspaceYDocAcknowledgement(header.requestId));
};

const syncWithServer = (socket: MockWebSocket, serverDoc: Y.Doc) => {
  socket.receive(
    encodeWorkspaceYDocSyncMessage((encoder) => syncProtocol.writeSyncStep1(encoder, serverDoc)),
  );

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

  // SAFETY: the preceding assertion verifies that the first registered instance exists.
  return socket as MockWebSocket;
};

const sentMessage = (socket: MockWebSocket, index: number) => {
  const message = socket.sent[index];
  expect(message).toBeInstanceOf(ArrayBuffer);

  // SAFETY: the preceding assertion verifies that the sent payload is an ArrayBuffer.
  return message as ArrayBuffer;
};

describe('WorkspaceYDocSyncClient', () => {
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

  it('requires acknowledgements for every batch, including deletions and newer edits', async () => {
    const doc = new Y.Doc();
    const statuses: WorkspaceYDocConnectionStatus[] = [];
    const client = new WorkspaceYDocSyncClient('ws-1', doc, (status) => statuses.push(status));
    client.connect();
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
    client.connect();
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

  it.each(['timeout', 'offline'])('does not permit data cleanup after %s', async (failure) => {
    const doc = new Y.Doc();
    const client = new WorkspaceYDocSyncClient('ws-1', doc, vi.fn());
    client.connect();
    const socket = firstSocket();
    socket.open();
    syncWithServer(socket, new Y.Doc());
    doc.getMap('fields').set('unsynced', 'keep me');
    const pending = client.flushAndWaitForSync().catch((error) => error);

    if (failure === 'timeout') vi.advanceTimersByTime(WORKSPACE_YDOC_CONNECT_TIMEOUT_MS);
    else window.dispatchEvent(new Event('offline'));
    expect(await pending).toBeInstanceOf(Error);
    expect(doc.getMap('fields').get('unsynced')).toBe('keep me');
    client.destroy();
  });

  it('recovers an unacknowledged update when returning online on an open socket', async () => {
    const doc = new Y.Doc();
    const server = new Y.Doc();
    const statuses: WorkspaceYDocConnectionStatus[] = [];
    const client = new WorkspaceYDocSyncClient('ws-1', doc, (status) => statuses.push(status));
    client.connect();
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

  it('keeps offline edits until differential sync when the socket remains open offline', async () => {
    const doc = new Y.Doc();
    const statuses: WorkspaceYDocConnectionStatus[] = [];
    const onConnectionStateChange = vi.fn((status) => statuses.push(status));
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const client = new WorkspaceYDocSyncClient('ws-1', doc, onConnectionStateChange);
    const serverDoc = new Y.Doc();

    client.connect();
    const socket = firstSocket();
    socket.open();
    socket.receive(
      encodeWorkspaceYDocSyncMessage((encoder) => syncProtocol.writeSyncStep1(encoder, serverDoc)),
    );
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
});
