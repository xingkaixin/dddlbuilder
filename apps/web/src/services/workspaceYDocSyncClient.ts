import type * as Y from 'yjs';
import { mergeUpdates } from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';

export type WorkspaceYDocConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'offline'
  | 'error';

const MESSAGE_SYNC = 0;
const MAX_RECONNECT_DELAY_MS = 10_000;
export const WORKSPACE_YDOC_UPDATE_BATCH_MS = 25;

const buildWorkspaceYDocUrl = (workspaceId: string) => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/api/workspaces/${encodeURIComponent(workspaceId)}/yjs`;
};

const encodeSyncMessage = (write: (encoder: encoding.Encoder) => void) => {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  write(encoder);
  return encoding.toUint8Array(encoder);
};

export class WorkspaceYDocSyncClient {
  private socket: WebSocket | null = null;
  private destroyed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingUpdates: Uint8Array[] = [];
  private reconnectDelayMs = 1000;
  private readonly workspaceId: string;
  private readonly doc: Y.Doc;
  private readonly onConnectionStateChange: (state: WorkspaceYDocConnectionState) => void;

  constructor(
    workspaceId: string,
    doc: Y.Doc,
    onConnectionStateChange: (state: WorkspaceYDocConnectionState) => void,
  ) {
    this.workspaceId = workspaceId;
    this.doc = doc;
    this.onConnectionStateChange = onConnectionStateChange;
    this.doc.on('update', this.handleDocUpdate);
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
  }

  connect() {
    if (this.destroyed || this.socket) return;
    if (typeof WebSocket === 'undefined') {
      this.onConnectionStateChange('error');
      return;
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.onConnectionStateChange('offline');
      return;
    }

    this.onConnectionStateChange('connecting');
    const socket = new WebSocket(buildWorkspaceYDocUrl(this.workspaceId));
    socket.binaryType = 'arraybuffer';
    this.socket = socket;

    socket.onopen = () => {
      this.reconnectDelayMs = 1000;
      this.onConnectionStateChange('connected');
      this.sendImmediate(
        encodeSyncMessage((encoder) => syncProtocol.writeSyncStep1(encoder, this.doc)),
      );
    };
    socket.onmessage = (event) => {
      void this.handleMessage(event.data);
    };
    socket.onerror = () => {
      this.onConnectionStateChange('error');
    };
    socket.onclose = () => {
      if (this.socket === socket) {
        this.socket = null;
      }
      if (!this.destroyed) {
        this.scheduleReconnect();
      }
    };
  }

  destroy() {
    this.destroyed = true;
    this.doc.off('update', this.handleDocUpdate);
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.flushPendingUpdates();
    this.socket?.close();
    this.socket = null;
  }

  private readonly handleDocUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === this) return;
    this.queueUpdate(update);
  };

  private readonly handleOnline = () => {
    if (!this.socket) {
      this.connect();
    }
  };

  private readonly handleOffline = () => {
    this.onConnectionStateChange('offline');
  };

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.onConnectionStateChange('offline');
      return;
    }
    this.onConnectionStateChange('connecting');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
      this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, MAX_RECONNECT_DELAY_MS);
    }, this.reconnectDelayMs);
  }

  private queueUpdate(update: Uint8Array) {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.pendingUpdates.push(update);
    if (this.flushTimer) return;

    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flushPendingUpdates();
    }, WORKSPACE_YDOC_UPDATE_BATCH_MS);
  }

  private flushPendingUpdates() {
    if (this.pendingUpdates.length === 0) return;
    const updates = this.pendingUpdates;
    this.pendingUpdates = [];
    const update = updates.length === 1 ? updates[0] : mergeUpdates(updates);
    this.sendImmediate(encodeSyncMessage((encoder) => syncProtocol.writeUpdate(encoder, update)));
  }

  private sendImmediate(message: Uint8Array) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      const payload = new Uint8Array(message.byteLength);
      payload.set(message);
      this.socket.send(payload.buffer);
    }
  }

  private async handleMessage(data: unknown) {
    const bytes =
      data instanceof ArrayBuffer
        ? new Uint8Array(data)
        : data instanceof Blob
          ? new Uint8Array(await data.arrayBuffer())
          : null;
    if (!bytes) return;

    const decoder = decoding.createDecoder(bytes);
    const messageType = decoding.readVarUint(decoder);
    if (messageType !== MESSAGE_SYNC) return;

    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.readSyncMessage(decoder, encoder, this.doc, this);
    if (encoding.length(encoder) > 1) {
      this.sendImmediate(encoding.toUint8Array(encoder));
    }
  }
}
