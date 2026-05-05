import type * as Y from 'yjs';
import { encodeStateAsUpdate, mergeUpdates } from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';

export type WorkspaceYDocConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'offline'
  | 'error';

export type WorkspaceYDocFailureReason = 'auth' | 'network' | 'service_unavailable' | 'unknown';

export type WorkspaceYDocConnectionStatus = {
  state: WorkspaceYDocConnectionState;
  failureReason?: WorkspaceYDocFailureReason;
};

const MESSAGE_SYNC = 0;
const MAX_RECONNECT_DELAY_MS = 10_000;
export const WORKSPACE_YDOC_UPDATE_BATCH_MS = 25;

const buildWorkspaceYDocPath = (workspaceId: string) =>
  `/api/workspaces/${encodeURIComponent(workspaceId)}/yjs`;

const buildWorkspaceYDocUrl = (workspaceId: string) => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${buildWorkspaceYDocPath(workspaceId)}`;
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
  private connecting = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingUpdates: Uint8Array[] = [];
  private reconnectDelayMs = 1000;
  private readonly ignoredSockets = new WeakSet<WebSocket>();
  private readonly workspaceId: string;
  private readonly doc: Y.Doc;
  private readonly onConnectionStateChange: (status: WorkspaceYDocConnectionStatus) => void;

  constructor(
    workspaceId: string,
    doc: Y.Doc,
    onConnectionStateChange: (status: WorkspaceYDocConnectionStatus) => void,
  ) {
    this.workspaceId = workspaceId;
    this.doc = doc;
    this.onConnectionStateChange = onConnectionStateChange;
    this.doc.on('update', this.handleDocUpdate);
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
  }

  async connect() {
    if (this.destroyed || this.socket || this.connecting) return;
    if (typeof WebSocket === 'undefined') {
      this.notify('error', 'unknown');
      return;
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.notify('offline');
      return;
    }

    this.connecting = true;
    this.notify('connecting');
    const failureReason = await this.checkAvailability();
    this.connecting = false;
    if (this.destroyed || this.socket) return;
    if (this.isOffline()) {
      this.notify('offline');
      return;
    }
    if (failureReason) {
      this.notify('error', failureReason);
      if (failureReason !== 'auth') {
        this.scheduleReconnect();
      }
      return;
    }

    const socket = new WebSocket(buildWorkspaceYDocUrl(this.workspaceId));
    socket.binaryType = 'arraybuffer';
    this.socket = socket;

    socket.onopen = () => {
      this.reconnectDelayMs = 1000;
      this.notify('connected');
      this.sendSyncState();
      this.sendFullState();
    };
    socket.onmessage = (event) => {
      void this.handleMessage(event.data);
    };
    socket.onerror = () => {
      if (this.isOffline()) {
        this.notify('offline');
        return;
      }
      this.notify('error', 'unknown');
    };
    socket.onclose = () => {
      if (this.ignoredSockets.has(socket)) return;
      if (this.socket === socket) {
        this.socket = null;
      }
      if (!this.destroyed) {
        if (this.isOffline()) {
          this.notify('offline');
        } else {
          this.notify('error', 'network');
        }
        this.scheduleReconnect();
      }
    };
  }

  retry() {
    if (this.destroyed) return;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.notify('connected');
      this.sendSyncState();
      this.sendFullState();
      return;
    }
    if (this.socket) {
      const socket = this.socket;
      this.ignoredSockets.add(socket);
      this.socket = null;
      socket.close();
    }
    void this.connect();
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
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.notify('connected');
      this.sendSyncState();
      this.sendFullState();
      return;
    }
    if (this.socket) {
      this.socket = null;
    }
    void this.connect();
  };

  private readonly handleOffline = () => {
    this.notify('offline');
  };

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    if (this.isOffline()) {
      this.notify('offline');
      return;
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
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

  private sendSyncState() {
    this.sendImmediate(
      encodeSyncMessage((encoder) => syncProtocol.writeSyncStep1(encoder, this.doc)),
    );
  }

  private sendFullState() {
    this.sendImmediate(
      encodeSyncMessage((encoder) =>
        syncProtocol.writeUpdate(encoder, encodeStateAsUpdate(this.doc)),
      ),
    );
  }

  private notify(state: WorkspaceYDocConnectionState, failureReason?: WorkspaceYDocFailureReason) {
    this.onConnectionStateChange({ state, failureReason });
  }

  private isOffline() {
    return typeof navigator !== 'undefined' && !navigator.onLine;
  }

  private async checkAvailability(): Promise<WorkspaceYDocFailureReason | null> {
    try {
      const response = await fetch(buildWorkspaceYDocPath(this.workspaceId), { method: 'HEAD' });
      if (response.ok) return null;
      if (response.status === 401 || response.status === 403) return 'auth';
      if (response.status === 503) return 'service_unavailable';
      return 'unknown';
    } catch {
      return 'network';
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
