import { readSessionAccess } from './auth.js';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import { WORKSPACE_SYNC_MESSAGE } from '@ddlbuilder/shared-types';
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
  ensureWorkspaceYDocMeta,
  exportWorkspaceYDocToSnapshot,
  isWorkspaceYDocInitialized,
  mergeWorkspaceSnapshotIntoYDoc,
} from '@ddlbuilder/workspace-core';
import { logWorkspaceYDocHealth } from './workspaceSyncMetrics.js';
import { applyWorkspaceMigrationSnapshot } from './workspaceMigration.js';
import {
  appendWorkspaceYDocUpdates,
  compactWorkspaceYDocStorage,
  readWorkspaceYDocStorage,
  WORKSPACE_YDOC_META_KEY,
  type WorkspaceYDocStoredMeta,
} from './workspaceYDocStorage.js';

type WorkspaceYDocSocketAttachment = {
  schemaVersion: 1;
  workspaceId?: string;
  userId?: string;
  sessionId: string;
};

type PendingWorkspaceUpdate = {
  seq: number;
  update: Uint8Array;
};

type WorkspaceYDocIdentity = {
  workspaceId?: string;
  userId?: string;
};

class WorkspaceYDocIdentityMismatchError extends Error {}

const MESSAGE_SYNC = WORKSPACE_SYNC_MESSAGE.sync;
const COMPACT_UPDATE_COUNT = 100;
const COMPACT_UPDATE_BYTES = 512 * 1024;
const ALARM_DELAY_MS = 60 * 60 * 1000;
const LAST_AUTOMATIC_ALARM_RETRY = 5;
const AUTH_CACHE_TTL_MS = 30_000;

const encodeSyncMessage = (write: (encoder: encoding.Encoder) => void) => {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  write(encoder);
  return encoding.toUint8Array(encoder);
};

const isSocketAttachment = (value: unknown): value is WorkspaceYDocSocketAttachment => {
  const record = value as Partial<WorkspaceYDocSocketAttachment> | null;
  return Boolean(record && record.schemaVersion === 1 && typeof record.sessionId === 'string');
};

export class WorkspaceYDocDurableObject {
  private doc: Y.Doc | null = null;
  private loadPromise: Promise<Y.Doc> | null = null;
  private persistQueue: Promise<void> | null = null;
  private compactQueue: Promise<void> = Promise.resolve();
  private readonly pendingUpdates: PendingWorkspaceUpdate[] = [];
  private nextSeq = 0;
  private alarmScheduled = false;
  private updateCount = 0;
  private updateBytes = 0;
  private lastCompactedSeq = 0;
  private lastCheckpointSeq = 0;
  private compactCount = 0;
  private checkpointFailedAt: number | undefined;
  private workspaceId: string | undefined;
  private userId: string | undefined;
  private authCache: { key: string; sessionIds: Set<string>; expiresAt: number } | null = null;
  private readonly state: DurableObjectState;
  private readonly env: ApiEnv['Bindings'];

  constructor(state: DurableObjectState, env: ApiEnv['Bindings']) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method === 'POST' && new URL(request.url).pathname.endsWith('/kick')) {
      return this.handleKick(request);
    }

    const identity = {
      workspaceId: request.headers.get('x-ddlbuilder-workspace-id') ?? undefined,
      userId: request.headers.get('x-ddlbuilder-user-id') ?? undefined,
    };
    let doc: Y.Doc;
    try {
      doc = await this.loadDoc(identity);
    } catch (error) {
      if (error instanceof WorkspaceYDocIdentityMismatchError) {
        return new Response('Workspace identity mismatch', { status: 409 });
      }
      throw error;
    }

    if (request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
      const sessionId = request.headers.get('x-ddlbuilder-session-id');
      if (!sessionId) return new Response('Missing session id', { status: 401 });
      try {
        const sessionIds = await this.authorizedSessionIds();
        if (!sessionIds.has(sessionId)) {
          return new Response('Workspace access denied', { status: 403 });
        }
      } catch {
        return new Response('Workspace authorization unavailable', { status: 503 });
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      const attachment = this.createSocketAttachment(sessionId);
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
      doc.transact(() => {
        ensureWorkspaceYDocMeta(doc);
        mergeWorkspaceSnapshotIntoYDoc(doc, snapshot);
      }, this);
      await this.awaitPersisted();
      await this.compact();
      return Response.json({
        ok: true,
        stateVectorBytes: Y.encodeStateVector(doc).byteLength,
      });
    }

    if (request.method === 'POST' && url.pathname.endsWith('/migrate')) {
      if (!identity.userId) return new Response('Missing user id', { status: 400 });
      const snapshot = (await request.json()) as WorkspaceMigrationSnapshot;
      const result = applyWorkspaceMigrationSnapshot(doc, identity.userId, snapshot);
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
    let doc: Y.Doc;
    try {
      doc = await this.loadDoc(this.readSocketIdentity(ws));
    } catch (error) {
      if (error instanceof WorkspaceYDocIdentityMismatchError) {
        ws.close(1008, 'Workspace access denied');
        return;
      }
      throw error;
    }
    if ((await this.authorizeSockets([ws])).length === 0) return;
    const decoder = decoding.createDecoder(new Uint8Array(message));
    let messageType = decoding.readVarUint(decoder);
    let requestId: number | undefined;
    if (messageType === WORKSPACE_SYNC_MESSAGE.syncWithAck) {
      requestId = decoding.readVarUint(decoder);
      messageType = decoding.readVarUint(decoder);
    }
    if (messageType !== MESSAGE_SYNC) return;

    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.readSyncMessage(decoder, encoder, doc, ws);
    try {
      await this.awaitPersisted();
    } catch (error) {
      ws.close(1011, 'Workspace persistence failed');
      throw error;
    }
    if (encoding.length(encoder) > 1) {
      ws.send(encoding.toUint8Array(encoder));
    }
    if (requestId !== undefined) {
      const acknowledgement = encoding.createEncoder();
      encoding.writeVarUint(acknowledgement, WORKSPACE_SYNC_MESSAGE.persisted);
      encoding.writeVarUint(acknowledgement, requestId);
      ws.send(encoding.toUint8Array(acknowledgement));
    }
  }

  async webSocketClose(ws: WebSocket, code: number, _reason: string, wasClean: boolean) {
    const identity = this.readSocketIdentity(ws);
    logWorkspaceYDocHealth('close', {
      workspaceId: this.workspaceId ?? identity.workspaceId,
      connectedSockets: this.connectedSocketCount(),
      compactCount: this.compactCount,
      closeCode: code,
      wasClean,
    });
  }

  async webSocketError(ws: WebSocket, error: unknown) {
    const identity = this.readSocketIdentity(ws);
    logWorkspaceYDocHealth('error', {
      workspaceId: this.workspaceId ?? identity.workspaceId,
      connectedSockets: this.connectedSocketCount(),
      compactCount: this.compactCount,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }

  async alarm(alarmInfo?: AlarmInvocationInfo) {
    this.alarmScheduled = false;
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

  private async loadDoc(identity: WorkspaceYDocIdentity = {}) {
    if (this.loadPromise) {
      const doc = await this.loadPromise;
      this.bindIdentity(identity);
      return doc;
    }
    if (this.doc) {
      this.bindIdentity(identity);
      return this.doc;
    }

    const doc = new Y.Doc();
    this.loadPromise = (async () => {
      const startedAt = Date.now();
      const { meta, snapshot, updates } = await readWorkspaceYDocStorage(this.state.storage);
      if (meta) {
        this.bindIdentity(meta);
        this.nextSeq = meta.nextSeq;
        this.updateCount = meta.updateCount;
        this.updateBytes = meta.updateBytes;
        this.lastCompactedSeq = meta.lastCompactedSeq;
        this.lastCheckpointSeq = meta.lastCheckpointSeq ?? 0;
        this.compactCount = meta.compactCount ?? 0;
        this.checkpointFailedAt = meta.checkpointFailedAt;
      }
      this.bindIdentity(identity);

      if (snapshot) {
        Y.applyUpdate(doc, snapshot, this);
      }

      let storedUpdateBytes = 0;
      for (const update of updates.values()) {
        storedUpdateBytes += update.byteLength;
        Y.applyUpdate(doc, update, this);
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
        if (!(error instanceof WorkspaceYDocIdentityMismatchError)) {
          console.error('[workspace-yjs-do] load failed', error);
        }
        throw error;
      })
      .finally(() => {
        this.loadPromise = null;
      });

    return this.loadPromise;
  }

  private readonly handleDocUpdate = (update: Uint8Array, origin: unknown) => {
    this.queuePersistUpdate(update);
    this.state.waitUntil(
      this.broadcastUpdate(update, origin).catch((error: unknown) => {
        console.error('[workspace-yjs-do] broadcast failed', error);
      }),
    );
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

    const persist = Promise.resolve().then(() => this.drainPendingUpdates());
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
      const pending = this.pendingUpdates.slice();
      try {
        await appendWorkspaceYDocUpdates(this.state.storage, pending, this.storedMeta());
        if (this.updateCount >= COMPACT_UPDATE_COUNT || this.updateBytes >= COMPACT_UPDATE_BYTES) {
          this.scheduleCompact();
        }
        await this.ensureAlarm();
        this.pendingUpdates.splice(0, pending.length);
      } catch (error) {
        const persistError = error instanceof Error ? error : new Error(String(error));
        logWorkspaceYDocHealth('persist_failed', {
          workspaceId: this.workspaceId,
          seq: pending[0].seq,
          errorMessage: persistError.message,
        });
        console.error('[workspace-yjs-do] persist failed', error);
        throw persistError;
      }
    }
  }

  private scheduleCompact() {
    this.state.waitUntil(
      this.compact().catch((error: unknown) => {
        console.error('[workspace-yjs-do] background compact failed', error);
      }),
    );
  }

  private async awaitPersisted() {
    this.startPersisting();
    await this.persistQueue;
  }

  // 登出等撤销事件推送至此：失效授权缓存并立即断开匹配的 socket
  private handleKick(request: Request): Response {
    const sessionId = request.headers.get('x-ddlbuilder-session-id');
    const userId = request.headers.get('x-ddlbuilder-user-id');
    this.authCache = null;
    for (const socket of this.state.getWebSockets()) {
      const attachment = socket.deserializeAttachment?.();
      if (!isSocketAttachment(attachment)) continue;
      if (sessionId && attachment.sessionId !== sessionId) continue;
      if (userId && attachment.userId !== userId) continue;
      socket.close(1008, 'Session revoked');
    }
    return Response.json({ ok: true });
  }

  private async authorizedSessionIds(): Promise<Set<string>> {
    const key = `${this.workspaceId ?? ''}:${this.userId ?? ''}`;
    const now = Date.now();
    if (this.authCache && this.authCache.key === key && this.authCache.expiresAt > now) {
      return this.authCache.sessionIds;
    }
    const { sessionIds } = await readSessionAccess(
      this.env,
      this.userId ?? '',
      this.workspaceId ?? '',
    );
    this.authCache = { key, sessionIds, expiresAt: now + AUTH_CACHE_TTL_MS };
    return sessionIds;
  }

  private async authorizeSockets(sockets: WebSocket[]): Promise<WebSocket[]> {
    if (sockets.length === 0) return [];
    try {
      const sessionIds = await this.authorizedSessionIds();
      return sockets.filter((socket) => {
        const attachment = socket.deserializeAttachment?.();
        if (
          isSocketAttachment(attachment) &&
          attachment.workspaceId === this.workspaceId &&
          attachment.userId === this.userId &&
          sessionIds.has(attachment.sessionId)
        )
          return true;
        socket.close(1008, 'Workspace access denied');
        return false;
      });
    } catch (error) {
      for (const socket of sockets) socket.close(1011, 'Workspace authorization unavailable');
      throw error;
    }
  }

  private async broadcastUpdate(update: Uint8Array, origin: unknown) {
    const message = encodeSyncMessage((encoder) => syncProtocol.writeUpdate(encoder, update));
    const sockets = this.state
      .getWebSockets()
      .filter((socket) => socket !== origin && socket.readyState === WebSocket.OPEN);
    for (const socket of await this.authorizeSockets(sockets)) {
      socket.send(message);
    }
  }

  private compact(options: { checkpoint?: boolean } = {}) {
    const compact = this.compactQueue
      .catch(() => undefined)
      .then(() => this.compactSnapshot(options));
    this.compactQueue = compact;
    return compact;
  }

  private async compactSnapshot(options: { checkpoint?: boolean }) {
    if (!this.doc) return;
    const startedAt = Date.now();
    const snapshot = Y.encodeStateAsUpdate(this.doc);
    const meta = this.storedMeta();
    const compactedUpdateCount = await compactWorkspaceYDocStorage(this.state.storage, snapshot, {
      ...meta,
      updateCount: 0,
      updateBytes: 0,
      lastCompactedSeq: meta.nextSeq,
      compactCount: this.compactCount + 1,
    });
    this.updateCount -= meta.updateCount;
    this.updateBytes -= meta.updateBytes;
    this.lastCompactedSeq = meta.nextSeq;
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
      compactedUpdateCount,
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
    this.updateCount = 0;
    this.updateBytes = 0;
    this.lastCompactedSeq = this.nextSeq;
    this.compactCount += 1;
    await compactWorkspaceYDocStorage(
      this.state.storage,
      Y.encodeStateAsUpdate(doc),
      this.storedMeta(),
    );
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

  private storedMeta(): WorkspaceYDocStoredMeta {
    return {
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
    };
  }

  private async writeMeta() {
    await this.state.storage.put(WORKSPACE_YDOC_META_KEY, this.storedMeta());
  }

  private async ensureAlarm() {
    if (this.alarmScheduled) return;
    const existing = await this.state.storage.getAlarm();
    if (existing == null) {
      await this.state.storage.setAlarm(Date.now() + ALARM_DELAY_MS);
    }
    this.alarmScheduled = true;
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

  private createSocketAttachment(sessionId: string): WorkspaceYDocSocketAttachment {
    return {
      schemaVersion: 1,
      workspaceId: this.workspaceId,
      userId: this.userId,
      sessionId,
    };
  }

  private readSocketIdentity(ws: WebSocket): WorkspaceYDocIdentity {
    const attachment = ws.deserializeAttachment?.();
    if (!isSocketAttachment(attachment)) return {};
    return { workspaceId: attachment.workspaceId, userId: attachment.userId };
  }

  private bindIdentity(identity: WorkspaceYDocIdentity) {
    if (identity.workspaceId) {
      if (this.workspaceId && this.workspaceId !== identity.workspaceId) {
        throw new WorkspaceYDocIdentityMismatchError();
      }
      if (!this.workspaceId) {
        this.workspaceId = identity.workspaceId;
        this.authCache = null;
      }
    }
    if (identity.userId) {
      if (this.userId && this.userId !== identity.userId) {
        throw new WorkspaceYDocIdentityMismatchError();
      }
      if (!this.userId) {
        this.userId = identity.userId;
        this.authCache = null;
      }
    }
  }
}
