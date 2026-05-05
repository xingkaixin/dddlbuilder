import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import {
  WORKSPACE_YDOC_UPDATE_BATCH_MS,
  WorkspaceYDocSyncClient,
} from '@/services/workspaceYDocSyncClient';

const MESSAGE_SYNC = 0;

const encodeSyncMessage = (write: (encoder: encoding.Encoder) => void) => {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  write(encoder);
  return encoding.toUint8Array(encoder);
};

const applySyncMessage = (doc: Y.Doc, message: ArrayBuffer) => {
  const decoder = decoding.createDecoder(new Uint8Array(message));
  expect(decoding.readVarUint(decoder)).toBe(MESSAGE_SYNC);
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  syncProtocol.readSyncMessage(decoder, encoder, doc, null);
};

const respondToSyncMessage = (doc: Y.Doc, message: ArrayBuffer) => {
  const decoder = decoding.createDecoder(new Uint8Array(message));
  expect(decoding.readVarUint(decoder)).toBe(MESSAGE_SYNC);
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  syncProtocol.readSyncMessage(decoder, encoder, doc, null);
  return encoding.length(encoder) > 1 ? encoding.toUint8Array(encoder) : null;
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
  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('batches 50 high-frequency local updates into one websocket update message', () => {
    const doc = new Y.Doc();
    const updates: Uint8Array[] = [];
    doc.on('update', (update) => updates.push(update));
    const client = new WorkspaceYDocSyncClient('ws-1', doc, vi.fn());

    client.connect();
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
    expect(updateMessage.byteLength).toBeLessThan(individualUpdateBytes);

    const peer = new Y.Doc();
    applySyncMessage(peer, updateMessage);
    expect(peer.getMap('fields').size).toBe(50);
    expect(peer.getMap('fields').get('field-49')).toBe('value-49');

    client.destroy();
  });

  it('uses sync state vectors to converge local offline changes after reconnect', async () => {
    const doc = new Y.Doc();
    doc.getMap('fields').set('offline-field', 'offline-value');
    const client = new WorkspaceYDocSyncClient('ws-1', doc, vi.fn());
    const serverDoc = new Y.Doc();

    client.connect();
    const socket = firstSocket();
    socket.open();
    socket.receive(encodeSyncMessage((encoder) => syncProtocol.writeSyncStep1(encoder, serverDoc)));
    await Promise.resolve();

    expect(socket.sent).toHaveLength(2);
    applySyncMessage(serverDoc, sentMessage(socket, 1));
    expect(serverDoc.getMap('fields').get('offline-field')).toBe('offline-value');

    client.destroy();
  });

  it('requests a fresh sync step when the browser returns online with an open socket', async () => {
    const doc = new Y.Doc();
    doc.getMap('fields').set('local-field', 'local-value');
    const client = new WorkspaceYDocSyncClient('ws-1', doc, vi.fn());
    const serverDoc = new Y.Doc();
    serverDoc.getMap('fields').set('remote-field', 'remote-value');

    client.connect();
    const socket = firstSocket();
    socket.open();
    expect(socket.sent).toHaveLength(1);

    window.dispatchEvent(new Event('online'));
    expect(socket.sent).toHaveLength(3);
    const response = respondToSyncMessage(serverDoc, sentMessage(socket, 1));
    expect(response).toBeInstanceOf(Uint8Array);
    if (!response) {
      throw new Error('Expected sync response');
    }
    applySyncMessage(serverDoc, sentMessage(socket, 2));
    socket.receive(response);
    await Promise.resolve();

    expect(doc.getMap('fields').get('remote-field')).toBe('remote-value');
    expect(serverDoc.getMap('fields').get('local-field')).toBe('local-value');

    client.destroy();
  });
});
