import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import type {
  WorkspaceMigrationSnapshot,
  WorkspaceSnapshot,
} from '@ddlbuilder/shared-types/workspace';
import type { ApiEnv } from './context.js';
import {
  checkpointWorkspaceSnapshotEntities,
  getWorkspaceSnapshotForWorkspace,
} from './workspaceEntities.js';
import {
  createWorkspaceYDocUpdateFromSnapshot,
  exportWorkspaceYDocToSnapshot,
  isWorkspaceYDocInitialized,
} from '@ddlbuilder/workspace-core';
import { logWorkspaceYDocHealth } from './workspaceSyncMetrics.js';
import { applyWorkspaceMigrationSnapshot } from './workspaceMigration.js';

type WorkspaceYDocStoredMeta = {
  workspaceId?: string;
  userId?: string;
  schemaVersion: number;
  nextSeq: number;
  updateCount: number;
  updateBytes: number;
  updatedAt: number;
  lastCompactedSeq: number;
  lastCheckpointSeq: number;
  compactCount?: number;
  checkpointFailedAt?: number;
};

type WorkspaceYDocSocketAttachment = {
  schemaVersion: 1;
  socketId: string;
  workspaceId?: string;
  userId?: string;
  connectedAt: number;
};

type PendingWorkspaceUpdate = {
  seq: number;
  update: Uint8Array;
};

const MESSAGE_SYNC = 0;
const SNAPSHOT_KEY = 'snapshot';
const META_KEY = 'meta';
const UPDATE_PREFIX = 'update:';
const COMPACT_UPDATE_COUNT = 100;
const COMPACT_UPDATE_BYTES = 512 * 1024;
const ALARM_DELAY_MS = 60 * 60 * 1000;
const LAST_AUTOMATIC_ALARM_RETRY = 5;

const encodeUpdateKey = (seq: number) => `${UPDATE_PREFIX}${seq.toString().padStart(16, '0')}`;

const encodeSyncMessage = (write: (encoder: encoding.Encoder) => void) => {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  write(encoder);
  return encoding.toUint8Array(encoder);
};

const toUint8Array = (value: unknown) => {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return null;
};

const isSocketAttachment = (value: unknown): value is WorkspaceYDocSocketAttachment => {
  const record = value as Partial<WorkspaceYDocSocketAttachment> | null;
  return Boolean(record && record.schemaVersion === 1 && typeof record.socketId === 'string');
};

const createSocketId = () => crypto.randomUUID();

export class WorkspaceYDocDurableObject {
  private doc: Y.Doc | null = null;
  private loadPromise: Promise<Y.Doc> | null = null;
  private persistQueue: Promise<void> | null = null;
  private readonly pendingUpdates: PendingWorkspaceUpdate[] = [];
  private nextSeq = 0;
  private updateCount = 0;
  private updateBytes = 0;
  private lastCompactedSeq = 0;
  private lastCheckpointSeq = 0;
  private compactCount = 0;
  private checkpointFailedAt: number | undefined;
  private workspaceId: string | undefined;
  private userId: string | undefined;
  private readonly state: DurableObjectState;
  private readonly env: ApiEnv['Bindings'];

  constructor(state: DurableObjectState, env: ApiEnv['Bindings']) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const workspaceId = request.headers.get('x-ddlbuilder-workspace-id') ?? undefined;
    if (workspaceId) {
      this.workspaceId = workspaceId;
    }
    const userId = request.headers.get('x-ddlbuilder-user-id') ?? undefined;
    if (userId) {
      this.userId = userId;
    }
    const doc = await this.loadDoc();

    if (request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      const attachment = this.createSocketAttachment();
      server.serializeAttachment?.(attachment);
      this.state.acceptWebSocket(server, attachment.workspaceId ? [attachment.workspaceId] : []);
      await this.writeMeta();
      server.send(encodeSyncMessage((encoder) => syncProtocol.writeSyncStep1(encoder, doc)));
      logWorkspaceYDocHealth('connect', {
        workspaceId: this.workspaceId,
        connectedSockets: this.connectedSocketCount(),
        updateCount: this.updateCount,
        updateBytes: this.updateBytes,
        compactCount: this.compactCount,
      });
      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname.endsWith('/state')) {
      const update = Y.encodeStateAsUpdate(doc);
      const body = new Uint8Array(update.byteLength);
      body.set(update);
      return new Response(body.buffer, {
        headers: {
          'content-type': 'application/octet-stream',
          'cache-control': 'no-store',
        },
      });
    }

    if (request.method === 'POST' && url.pathname.endsWith('/import')) {
      const snapshot = (await request.json()) as WorkspaceSnapshot;
      const update = createWorkspaceYDocUpdateFromSnapshot(snapshot);
      Y.applyUpdate(doc, update, this);
      await this.awaitPersisted();
      await this.compact();
      return Response.json({
        ok: true,
        stateVectorBytes: Y.encodeStateVector(doc).byteLength,
      });
    }

    if (request.method === 'POST' && url.pathname.endsWith('/migrate')) {
      if (!userId) return new Response('Missing user id', { status: 400 });
      const snapshot = (await request.json()) as WorkspaceMigrationSnapshot;
      const result = applyWorkspaceMigrationSnapshot(doc, userId, snapshot);
      await this.awaitPersisted();
      await this.compact();
      return Response.json(result);
    }

    if (request.method === 'POST' && url.pathname.endsWith('/compact')) {
      await this.compact();
      return Response.json({ ok: true });
    }

    return new Response('Not Found', { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string) {
    if (typeof message === 'string') return;
    this.restoreSocketAttachment(ws);
    const doc = await this.loadDoc();
    const decoder = decoding.createDecoder(new Uint8Array(message));
    const messageType = decoding.readVarUint(decoder);
    if (messageType !== MESSAGE_SYNC) return;

    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.readSyncMessage(decoder, encoder, doc, ws);
    await this.awaitPersisted();
    if (encoding.length(encoder) > 1) {
      ws.send(encoding.toUint8Array(encoder));
    }
  }

  async webSocketClose(ws: WebSocket, code: number, _reason: string, wasClean: boolean) {
    this.restoreSocketAttachment(ws);
    logWorkspaceYDocHealth('close', {
      workspaceId: this.workspaceId,
      connectedSockets: this.connectedSocketCount(),
      compactCount: this.compactCount,
      closeCode: code,
      wasClean,
    });
  }

  async webSocketError(ws: WebSocket, error: unknown) {
    this.restoreSocketAttachment(ws);
    logWorkspaceYDocHealth('error', {
      workspaceId: this.workspaceId,
      connectedSockets: this.connectedSocketCount(),
      compactCount: this.compactCount,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }

  async alarm(alarmInfo?: AlarmInvocationInfo) {
    await this.loadDoc();
    if (!this.hasPendingCheckpoint()) return;

    try {
      await this.compact();
    } catch (error) {
      if (!alarmInfo?.isRetry || alarmInfo.retryCount < LAST_AUTOMATIC_ALARM_RETRY) {
        throw error;
      }
      await this.ensureAlarm();
    }
  }

  private async loadDoc() {
    if (this.loadPromise) return this.loadPromise;
    if (this.doc) return this.doc;

    const doc = new Y.Doc();
    this.loadPromise = (async () => {
      const startedAt = Date.now();
      const [meta, snapshot] = await Promise.all([
        this.state.storage.get<WorkspaceYDocStoredMeta>(META_KEY),
        this.state.storage.get<Uint8Array | ArrayBuffer>(SNAPSHOT_KEY),
      ]);
      if (meta) {
        this.workspaceId = meta.workspaceId ?? this.workspaceId;
        this.nextSeq = meta.nextSeq;
        this.updateCount = meta.updateCount;
        this.updateBytes = meta.updateBytes;
        this.lastCompactedSeq = meta.lastCompactedSeq;
        this.lastCheckpointSeq = meta.lastCheckpointSeq ?? 0;
        this.compactCount = meta.compactCount ?? 0;
        this.checkpointFailedAt = meta.checkpointFailedAt;
        this.userId = meta.userId ?? this.userId;
      }

      const snapshotBytes = toUint8Array(snapshot);
      if (snapshotBytes) {
        Y.applyUpdate(doc, snapshotBytes, this);
      }

      const updates = await this.state.storage.list<Uint8Array | ArrayBuffer>({
        prefix: UPDATE_PREFIX,
      });
      let storedUpdateBytes = 0;
      for (const value of updates.values()) {
        const update = toUint8Array(value);
        if (update) {
          storedUpdateBytes += update.byteLength;
          Y.applyUpdate(doc, update, this);
        }
      }

      let restoredFromD1 = false;
      if (!isWorkspaceYDocInitialized(doc)) {
        restoredFromD1 = await this.restoreFromD1(doc);
      }

      doc.on('update', this.handleDocUpdate);
      this.doc = doc;
      logWorkspaceYDocHealth('load', {
        workspaceId: this.workspaceId,
        loadDurationMs: Date.now() - startedAt,
        storedUpdateCount: updates.size,
        storedUpdateBytes,
        updateCount: this.updateCount,
        updateBytes: this.updateBytes,
        compactCount: this.compactCount,
        connectedSockets: this.connectedSocketCount(),
        restoredFromD1,
      });
      return doc;
    })()
      .catch((error: unknown) => {
        this.doc = null;
        doc.destroy();
        console.error('[workspace-yjs-do] load failed', error);
        throw error;
      })
      .finally(() => {
        this.loadPromise = null;
      });

    return this.loadPromise;
  }

  private readonly handleDocUpdate = (update: Uint8Array, origin: unknown) => {
    this.queuePersistUpdate(update);
    this.broadcastUpdate(update, origin);
  };

  private queuePersistUpdate(update: Uint8Array) {
    const seq = this.nextSeq + 1;
    this.nextSeq = seq;
    this.updateCount += 1;
    this.updateBytes += update.byteLength;
    this.pendingUpdates.push({ seq, update });
    this.startPersisting();
  }

  private startPersisting() {
    if (this.persistQueue || this.pendingUpdates.length === 0) return;

    const persist = this.drainPendingUpdates();
    this.persistQueue = persist;
    void persist.then(
      () => {
        if (this.persistQueue === persist) this.persistQueue = null;
      },
      () => {
        if (this.persistQueue === persist) this.persistQueue = null;
      },
    );
  }

  private async drainPendingUpdates() {
    while (this.pendingUpdates.length > 0) {
      const pending = this.pendingUpdates[0];
      try {
        await this.state.storage.put(encodeUpdateKey(pending.seq), pending.update);
        await this.writeMeta();
        if (this.updateCount >= COMPACT_UPDATE_COUNT || this.updateBytes >= COMPACT_UPDATE_BYTES) {
          await this.compact();
        }
        await this.ensureAlarm();
        this.pendingUpdates.shift();
      } catch (error) {
        const persistError = error instanceof Error ? error : new Error(String(error));
        logWorkspaceYDocHealth('persist_failed', {
          workspaceId: this.workspaceId,
          seq: pending.seq,
          errorMessage: persistError.message,
        });
        console.error('[workspace-yjs-do] persist failed', error);
        throw persistError;
      }
    }
  }

  private async awaitPersisted() {
    this.startPersisting();
    await this.persistQueue;
  }

  private broadcastUpdate(update: Uint8Array, origin: unknown) {
    const message = encodeSyncMessage((encoder) => syncProtocol.writeUpdate(encoder, update));
    for (const socket of this.state.getWebSockets()) {
      if (socket === origin || socket.readyState !== WebSocket.OPEN) continue;
      socket.send(message);
    }
  }

  private async compact(options: { checkpoint?: boolean } = {}) {
    if (!this.doc) return;
    const startedAt = Date.now();
    const snapshot = Y.encodeStateAsUpdate(this.doc);
    const updateKeys = await this.state.storage.list({ prefix: UPDATE_PREFIX });
    await this.state.storage.put(SNAPSHOT_KEY, snapshot);
    await Promise.all(Array.from(updateKeys.keys()).map((key) => this.state.storage.delete(key)));
    this.updateCount = 0;
    this.updateBytes = 0;
    this.lastCompactedSeq = this.nextSeq;
    this.compactCount += 1;
    let checkpointError: unknown;
    if (options.checkpoint !== false) {
      try {
        await this.checkpointD1();
      } catch (error) {
        checkpointError = error;
      }
    }
    await this.writeMeta();
    logWorkspaceYDocHealth('compact', {
      workspaceId: this.workspaceId,
      compactDurationMs: Date.now() - startedAt,
      compactCount: this.compactCount,
      compactedUpdateCount: updateKeys.size,
      snapshotBytes: snapshot.byteLength,
      connectedSockets: this.connectedSocketCount(),
      checkpointed: options.checkpoint !== false && checkpointError === undefined,
      lastCompactedSeq: this.lastCompactedSeq,
      lastCheckpointSeq: this.lastCheckpointSeq,
    });
    if (checkpointError !== undefined) {
      throw checkpointError;
    }
  }

  private async restoreFromD1(doc: Y.Doc) {
    if (!this.workspaceId || !this.userId) return false;
    const snapshot = await getWorkspaceSnapshotForWorkspace(
      this.env,
      this.userId,
      this.workspaceId,
    );
    if (
      !snapshot.globalDraft &&
      snapshot.drafts.length === 0 &&
      snapshot.savedTables.length === 0 &&
      snapshot.savedDrafts.length === 0 &&
      snapshot.folders.length === 0
    ) {
      return false;
    }

    Y.applyUpdate(doc, createWorkspaceYDocUpdateFromSnapshot(snapshot), this);
    this.doc = doc;
    await this.awaitPersisted();
    await this.compact({ checkpoint: false });
    return true;
  }

  private async checkpointD1() {
    if (!this.doc || !this.workspaceId || !this.userId) return;
    const checkpointSeq = this.nextSeq;
    const snapshot = exportWorkspaceYDocToSnapshot(this.doc);
    try {
      await checkpointWorkspaceSnapshotEntities(this.env, this.userId, this.workspaceId, snapshot);
      this.lastCheckpointSeq = checkpointSeq;
      this.checkpointFailedAt = undefined;
    } catch (error) {
      this.checkpointFailedAt = Date.now();
      console.error('[workspace-yjs-do] checkpoint failed', error);
      throw error;
    }
  }

  private async writeMeta() {
    await this.state.storage.put<WorkspaceYDocStoredMeta>(META_KEY, {
      workspaceId: this.workspaceId,
      userId: this.userId,
      schemaVersion: 1,
      nextSeq: this.nextSeq,
      updateCount: this.updateCount,
      updateBytes: this.updateBytes,
      updatedAt: Date.now(),
      lastCompactedSeq: this.lastCompactedSeq,
      lastCheckpointSeq: this.lastCheckpointSeq,
      compactCount: this.compactCount,
      checkpointFailedAt: this.checkpointFailedAt,
    });
  }

  private async ensureAlarm() {
    const existing = await this.state.storage.getAlarm();
    if (existing == null) {
      await this.state.storage.setAlarm(Date.now() + ALARM_DELAY_MS);
    }
  }

  private hasPendingCheckpoint() {
    return (
      this.updateCount > 0 ||
      this.lastCheckpointSeq < this.nextSeq ||
      this.checkpointFailedAt !== undefined
    );
  }

  private connectedSocketCount() {
    const openState = typeof WebSocket === 'undefined' ? 1 : WebSocket.OPEN;
    return this.state.getWebSockets().filter((socket) => socket.readyState === openState).length;
  }

  private createSocketAttachment(): WorkspaceYDocSocketAttachment {
    return {
      schemaVersion: 1,
      socketId: createSocketId(),
      workspaceId: this.workspaceId,
      userId: this.userId,
      connectedAt: Date.now(),
    };
  }

  private restoreSocketAttachment(ws: WebSocket) {
    // Hibernation restarts the constructor, so socket-scoped identity must come from attachment.
    const attachment = ws.deserializeAttachment?.();
    if (!isSocketAttachment(attachment)) return;
    this.workspaceId = attachment.workspaceId ?? this.workspaceId;
    this.userId = attachment.userId ?? this.userId;
  }
}
