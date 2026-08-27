import type * as Y from 'yjs';
import { encodeStateAsUpdate, mergeUpdates } from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import { WORKSPACE_SYNC_MESSAGE } from '@ddlbuilder/shared-types';
import {
  materializeWorkspaceYDoc,
  WORKSPACE_YDOC_LOCAL_EDIT_ORIGIN,
} from '@/services/workspaceYDocAdapter';

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
  synced: boolean;
};

const MESSAGE_SYNC = WORKSPACE_SYNC_MESSAGE.sync;
const MAX_RECONNECT_DELAY_MS = 10_000;
export const WORKSPACE_YDOC_CONNECT_TIMEOUT_MS = 8_000;
export const WORKSPACE_YDOC_UPDATE_IDLE_MS = 2_000;
export const WORKSPACE_YDOC_UPDATE_MAX_WAIT_MS = 12_000;
export const WORKSPACE_YDOC_UPDATE_BATCH_MS = WORKSPACE_YDOC_UPDATE_IDLE_MS;

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
  private maxFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private socketOpenTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingUpdates: Uint8Array[] = [];
  private pendingUpdatesStartedAt: number | null = null;
  private reconnectDelayMs = 1000;
  private syncRoundTripComplete = false;
  private nextRequestId = 0;
  private readonly pendingAcknowledgements = new Set<number>();
  private browserOffline = false;
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
    window.addEventListener('blur', this.handleImmediateFlush);
    window.addEventListener('pagehide', this.handleImmediateFlush);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
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
    this.socketOpenTimer = setTimeout(() => {
      if (this.destroyed || this.socket !== socket || socket.readyState === WebSocket.OPEN) {
        return;
      }
      this.discardSocket(socket);
      this.notify('error', 'network');
      this.scheduleReconnect();
    }, WORKSPACE_YDOC_CONNECT_TIMEOUT_MS);

    socket.onopen = () => {
      if (!this.isCurrentSocket(socket)) {
        socket.close();
        return;
      }
      this.clearSocketOpenTimer();
      this.reconnectDelayMs = 1000;
      this.syncRoundTripComplete = false;
      this.pendingAcknowledgements.clear();
      if (this.isOffline()) {
        this.notify('offline');
        return;
      }
      this.notify('connected');
      this.sendSyncState();
      this.sendFullState();
    };
    socket.onmessage = (event) => {
      if (this.isCurrentSocket(socket)) {
        void this.handleMessage(socket, event.data);
      }
    };
    socket.onerror = () => {
      if (!this.isCurrentSocket(socket)) return;
      this.clearSocketOpenTimer();
      if (this.isOffline()) {
        this.notify('offline');
        return;
      }
      this.notify('error', 'unknown');
    };
    socket.onclose = () => {
      if (!this.isCurrentSocket(socket)) return;
      this.clearSocketOpenTimer();
      this.socket = null;
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
      this.syncRoundTripComplete = false;
      this.pendingAcknowledgements.clear();
      this.notify('connected');
      this.sendSyncState();
      this.sendFullState();
      return;
    }
    if (this.socket) {
      this.discardSocket(this.socket);
    }
    void this.connect();
  }

  destroy() {
    this.destroyed = true;
    this.doc.off('update', this.handleDocUpdate);
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    window.removeEventListener('blur', this.handleImmediateFlush);
    window.removeEventListener('pagehide', this.handleImmediateFlush);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.clearFlushTimers();
    this.clearSocketOpenTimer();
    this.flushPendingUpdates();
    this.pendingUpdatesStartedAt = null;
    if (this.socket) {
      this.discardSocket(this.socket);
    }
  }

  private readonly handleDocUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === this) return;
    this.queueUpdate(update);
  };

  private readonly handleOnline = () => {
    this.browserOffline = false;
    this.clearPendingUpdates();
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.syncRoundTripComplete = false;
      this.pendingAcknowledgements.clear();
      this.notify('connected');
      this.sendSyncState();
      this.sendFullState();
      return;
    }
    if (this.socket) {
      console.warn(
        JSON.stringify({
          event: 'workspace_yjs_client_socket_replaced',
          workspaceId: this.workspaceId,
          readyState: this.socket.readyState,
        }),
      );
      this.discardSocket(this.socket);
    }
    void this.connect();
  };

  private readonly handleOffline = () => {
    this.browserOffline = true;
    this.clearPendingUpdates();
    this.notify('offline');
  };

  private readonly handleImmediateFlush = () => {
    this.flushPendingUpdates();
  };

  private readonly handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      this.flushPendingUpdates();
    }
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
    if (this.isOffline()) {
      this.notify('offline');
      return;
    }
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.pendingUpdates.push(update);
    this.pendingUpdatesStartedAt ??= Date.now();
    this.notify('connected');
    this.schedulePendingFlush();
  }

  private schedulePendingFlush() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flushPendingUpdates();
    }, WORKSPACE_YDOC_UPDATE_IDLE_MS);
    if (this.maxFlushTimer) return;
    this.maxFlushTimer = setTimeout(() => {
      this.maxFlushTimer = null;
      this.flushPendingUpdates();
    }, WORKSPACE_YDOC_UPDATE_MAX_WAIT_MS);
  }

  private flushPendingUpdates() {
    if (this.pendingUpdates.length === 0) return;
    if (this.isOffline()) {
      this.clearPendingUpdates();
      this.notify('offline');
      return;
    }
    this.clearFlushTimers();
    const updates = this.pendingUpdates;
    const startedAt = this.pendingUpdatesStartedAt;
    this.pendingUpdates = [];
    this.pendingUpdatesStartedAt = null;
    const update = updates.length === 1 ? updates[0] : mergeUpdates(updates);
    const message = encodeSyncMessage((encoder) => syncProtocol.writeUpdate(encoder, update));
    const messageBytes = this.sendImmediate(message, true);
    console.info(
      JSON.stringify({
        event: 'workspace_yjs_client_batch',
        workspaceId: this.workspaceId,
        updateCount: updates.length,
        updateBytes: update.byteLength,
        messageBytes,
        durationMs: startedAt == null ? 0 : Date.now() - startedAt,
      }),
    );
    if (!this.destroyed && this.socket?.readyState === WebSocket.OPEN) {
      this.notify('connected');
    }
  }

  private clearPendingUpdates() {
    this.clearFlushTimers();
    this.pendingUpdates = [];
    this.pendingUpdatesStartedAt = null;
  }

  private clearFlushTimers() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.maxFlushTimer) {
      clearTimeout(this.maxFlushTimer);
      this.maxFlushTimer = null;
    }
  }

  private clearSocketOpenTimer() {
    if (this.socketOpenTimer) {
      clearTimeout(this.socketOpenTimer);
      this.socketOpenTimer = null;
    }
  }

  private discardSocket(socket: WebSocket) {
    this.ignoredSockets.add(socket);
    if (this.socket === socket) {
      this.clearSocketOpenTimer();
      this.socket = null;
    }
    socket.close();
  }

  private isCurrentSocket(socket: WebSocket) {
    return !this.destroyed && this.socket === socket && !this.ignoredSockets.has(socket);
  }

  private sendImmediate(message: Uint8Array, requireAcknowledgement = false) {
    if (!this.isOffline() && this.socket?.readyState === WebSocket.OPEN) {
      if (requireAcknowledgement) {
        const requestId = ++this.nextRequestId;
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, WORKSPACE_SYNC_MESSAGE.syncWithAck);
        encoding.writeVarUint(encoder, requestId);
        encoding.writeUint8Array(encoder, message);
        message = encoding.toUint8Array(encoder);
        this.pendingAcknowledgements.add(requestId);
      }
      const payload = new Uint8Array(message.byteLength);
      payload.set(message);
      this.socket.send(payload.buffer);
      return payload.byteLength;
    }
    return 0;
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
      true,
    );
  }

  private notify(state: WorkspaceYDocConnectionState, failureReason?: WorkspaceYDocFailureReason) {
    this.onConnectionStateChange({
      state,
      failureReason,
      synced:
        state === 'connected' &&
        this.syncRoundTripComplete &&
        this.pendingAcknowledgements.size === 0 &&
        this.pendingUpdates.length === 0,
    });
  }

  private isOffline() {
    return this.browserOffline || (typeof navigator !== 'undefined' && !navigator.onLine);
  }

  private async checkAvailability(): Promise<WorkspaceYDocFailureReason | null> {
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
      const response = await Promise.race<Response | null>([
        fetch(buildWorkspaceYDocPath(this.workspaceId), {
          method: 'HEAD',
          signal: controller.signal,
        }),
        new Promise<null>((resolve) => {
          timeoutId = setTimeout(() => resolve(null), WORKSPACE_YDOC_CONNECT_TIMEOUT_MS);
        }),
      ]);
      if (!response) {
        controller.abort();
        return 'network';
      }
      if (response.ok) return null;
      if (response.status === 401 || response.status === 403) return 'auth';
      if (response.status === 503) return 'service_unavailable';
      return 'unknown';
    } catch {
      return 'network';
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  private async handleMessage(socket: WebSocket, data: unknown) {
    const bytes =
      data instanceof ArrayBuffer
        ? new Uint8Array(data)
        : data instanceof Blob
          ? new Uint8Array(await data.arrayBuffer())
          : null;
    if (!bytes || !this.isCurrentSocket(socket)) return;

    const decoder = decoding.createDecoder(bytes);
    const messageType = decoding.readVarUint(decoder);
    if (messageType === WORKSPACE_SYNC_MESSAGE.persisted) {
      const requestId = decoding.readVarUint(decoder);
      if (this.pendingAcknowledgements.delete(requestId)) {
        this.notify(this.isOffline() ? 'offline' : 'connected');
      }
      return;
    }
    if (messageType !== MESSAGE_SYNC) return;

    const syncMessageType = decoding.peekVarUint(decoder);
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.readSyncMessage(decoder, encoder, this.doc, this);
    if (encoding.length(encoder) > 1) {
      this.sendImmediate(encoding.toUint8Array(encoder), true);
    }
    let materialized = false;
    this.doc.transact(() => {
      materialized = materializeWorkspaceYDoc(this.doc);
    }, WORKSPACE_YDOC_LOCAL_EDIT_ORIGIN);
    if (materialized) {
      this.flushPendingUpdates();
      this.syncRoundTripComplete = false;
      this.sendSyncState();
      this.notify('connected');
      return;
    }
    if (syncMessageType === syncProtocol.messageYjsSyncStep2) {
      this.syncRoundTripComplete = true;
    }
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.notify('connected');
    }
  }
}
