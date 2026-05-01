import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import type { WorkspaceSnapshot } from '@ddlbuilder/shared-types/workspace';
import { createWorkspaceYDocUpdateFromSnapshot } from './workspaceYDocSnapshot.js';

type WorkspaceYDocStoredMeta = {
  workspaceId?: string;
  schemaVersion: number;
  nextSeq: number;
  updateCount: number;
  updateBytes: number;
  updatedAt: number;
  lastCompactedSeq: number;
};

const MESSAGE_SYNC = 0;
const SNAPSHOT_KEY = 'snapshot';
const META_KEY = 'meta';
const UPDATE_PREFIX = 'update:';
const COMPACT_UPDATE_COUNT = 100;
const COMPACT_UPDATE_BYTES = 512 * 1024;
const ALARM_DELAY_MS = 60 * 60 * 1000;

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

export class WorkspaceYDocDurableObject {
  private doc: Y.Doc | null = null;
  private loadPromise: Promise<Y.Doc> | null = null;
  private persistQueue: Promise<void> = Promise.resolve();
  private nextSeq = 0;
  private updateCount = 0;
  private updateBytes = 0;
  private lastCompactedSeq = 0;
  private workspaceId: string | undefined;
  private readonly state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const doc = await this.loadDoc();
    const workspaceId = request.headers.get('x-ddlbuilder-workspace-id') ?? undefined;
    if (workspaceId) {
      this.workspaceId = workspaceId;
    }

    if (request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.state.acceptWebSocket(server);
      server.send(encodeSyncMessage((encoder) => syncProtocol.writeSyncStep1(encoder, doc)));
      await this.ensureAlarm();
      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname.endsWith('/state')) {
      return new Response(Y.encodeStateAsUpdate(doc), {
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
      await this.persistQueue;
      return Response.json({
        ok: true,
        stateVectorBytes: Y.encodeStateVector(doc).byteLength,
      });
    }

    if (request.method === 'POST' && url.pathname.endsWith('/compact')) {
      await this.compact();
      return Response.json({ ok: true });
    }

    return new Response('Not Found', { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string) {
    if (typeof message === 'string') return;
    const doc = await this.loadDoc();
    const decoder = decoding.createDecoder(new Uint8Array(message));
    const messageType = decoding.readVarUint(decoder);
    if (messageType !== MESSAGE_SYNC) return;

    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.readSyncMessage(decoder, encoder, doc, ws);
    if (encoding.length(encoder) > 1) {
      ws.send(encoding.toUint8Array(encoder));
    }
  }

  async alarm() {
    await this.loadDoc();
    await this.compact();
    await this.ensureAlarm();
  }

  private async loadDoc() {
    if (this.doc) return this.doc;
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = (async () => {
      const doc = new Y.Doc();
      const [meta, snapshot] = await Promise.all([
        this.state.storage.get<WorkspaceYDocStoredMeta>(META_KEY),
        this.state.storage.get<Uint8Array | ArrayBuffer>(SNAPSHOT_KEY),
      ]);
      if (meta) {
        this.workspaceId = meta.workspaceId;
        this.nextSeq = meta.nextSeq;
        this.updateCount = meta.updateCount;
        this.updateBytes = meta.updateBytes;
        this.lastCompactedSeq = meta.lastCompactedSeq;
      }

      const snapshotBytes = toUint8Array(snapshot);
      if (snapshotBytes) {
        Y.applyUpdate(doc, snapshotBytes, this);
      }

      const updates = await this.state.storage.list<Uint8Array | ArrayBuffer>({
        prefix: UPDATE_PREFIX,
      });
      for (const value of updates.values()) {
        const update = toUint8Array(value);
        if (update) {
          Y.applyUpdate(doc, update, this);
        }
      }

      doc.on('update', this.handleDocUpdate);
      this.doc = doc;
      return doc;
    })();

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

    this.persistQueue = this.persistQueue
      .then(async () => {
        await this.state.storage.put(encodeUpdateKey(seq), update);
        await this.writeMeta();
        if (this.updateCount >= COMPACT_UPDATE_COUNT || this.updateBytes >= COMPACT_UPDATE_BYTES) {
          await this.compact();
        }
        await this.ensureAlarm();
      })
      .catch((error) => {
        console.error('[workspace-yjs-do] persist failed', error);
      });
  }

  private broadcastUpdate(update: Uint8Array, origin: unknown) {
    const message = encodeSyncMessage((encoder) => syncProtocol.writeUpdate(encoder, update));
    for (const socket of this.state.getWebSockets()) {
      if (socket === origin || socket.readyState !== WebSocket.OPEN) continue;
      socket.send(message);
    }
  }

  private async compact() {
    if (!this.doc) return;
    const snapshot = Y.encodeStateAsUpdate(this.doc);
    const updateKeys = await this.state.storage.list({ prefix: UPDATE_PREFIX });
    await this.state.storage.put(SNAPSHOT_KEY, snapshot);
    await Promise.all(Array.from(updateKeys.keys()).map((key) => this.state.storage.delete(key)));
    this.updateCount = 0;
    this.updateBytes = 0;
    this.lastCompactedSeq = this.nextSeq;
    await this.writeMeta();
  }

  private async writeMeta() {
    await this.state.storage.put<WorkspaceYDocStoredMeta>(META_KEY, {
      workspaceId: this.workspaceId,
      schemaVersion: 1,
      nextSeq: this.nextSeq,
      updateCount: this.updateCount,
      updateBytes: this.updateBytes,
      updatedAt: Date.now(),
      lastCompactedSeq: this.lastCompactedSeq,
    });
  }

  private async ensureAlarm() {
    const existing = await this.state.storage.getAlarm();
    if (existing == null) {
      await this.state.storage.setAlarm(Date.now() + ALARM_DELAY_MS);
    }
  }
}
