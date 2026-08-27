import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as syncProtocol from 'y-protocols/sync';
import { ensureWorkspaceYDocMeta } from '@ddlbuilder/workspace-core';
import { WORKSPACE_SYNC_MESSAGE } from '@ddlbuilder/shared-types';
import type { ApiEnv } from '../../lib/context.js';
import { WorkspaceYDocDurableObject } from '../../lib/workspaceYDocDurableObject.js';
import { disableAdminUser } from '../../lib/adminUsers.js';
import { createSqliteD1Database } from '../helpers/sqliteD1';
import { createDurableObjectState } from '../helpers/durableObjectState';

const createSocket = (sessionId: string | null = 'session-1') => ({
  readyState: 1,
  send: vi.fn(),
  close: vi.fn(),
  deserializeAttachment: () => ({
    schemaVersion: 1,
    socketId: 'socket-1',
    workspaceId: 'ws-1',
    userId: 'user-1',
    sessionId,
    connectedAt: 1,
  }),
});

describe('workspace socket authorization', () => {
  let fixture: ReturnType<typeof createSqliteD1Database>;
  let state: DurableObjectState;
  let env: ApiEnv['Bindings'];
  let doc: Y.Doc;
  let object: WorkspaceYDocDurableObject;

  beforeEach(() => {
    vi.stubGlobal('WebSocket', { OPEN: 1 });
    vi.spyOn(console, 'info').mockImplementation(() => {});
    fixture = createSqliteD1Database({ includeMeta: true });
    fixture.sqlite.exec(`
      INSERT INTO user (id, name, email, created_at, updated_at)
      VALUES ('user-1', 'User', 'user@example.com', 1, 1);
      INSERT INTO workspaces (id, user_id, name, created_at, updated_at)
      VALUES ('ws-1', 'user-1', 'Workspace', 1, 1);
    `);
    fixture.sqlite
      .prepare(
        'INSERT INTO session (id, token, expires_at, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 1)',
      )
      .run('session-1', 'token-1', Date.now() + 60000, 'user-1');
    doc = new Y.Doc();
    ensureWorkspaceYDocMeta(doc);
    ({ state } = createDurableObjectState(new Map([['snapshot', Y.encodeStateAsUpdate(doc)]])));
    env = { USER_DB: fixture.database } as ApiEnv['Bindings'];
    object = new WorkspaceYDocDurableObject(state, env);
  });

  afterEach(() => {
    doc.destroy();
    fixture.sqlite.close();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const sendUpdate = async (
    target: WorkspaceYDocDurableObject,
    socket: ReturnType<typeof createSocket>,
    value: string,
  ) => {
    doc.getMap('fields').set('name', value);
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, WORKSPACE_SYNC_MESSAGE.syncWithAck);
    encoding.writeVarUint(encoder, 1);
    encoding.writeVarUint(encoder, WORKSPACE_SYNC_MESSAGE.sync);
    syncProtocol.writeUpdate(encoder, Y.encodeStateAsUpdate(doc));
    const message = encoding.toUint8Array(encoder);
    await target.webSocketMessage(socket as unknown as WebSocket, message.slice().buffer);
  };

  it.each(['disabled', 'disabled-with-session', 'revoked', 'expired', 'wrong-owner'])(
    'rejects %s sessions before applying or acknowledging an update',
    async (reason) => {
      const socket = createSocket();
      await sendUpdate(object, socket, 'before');
      socket.send.mockClear();
      if (reason === 'disabled') await disableAdminUser(fixture.database, 'user-1');
      if (reason === 'disabled-with-session')
        fixture.sqlite.exec(
          "INSERT INTO admin_user_flags (user_id, disabled_at) VALUES ('user-1', CURRENT_TIMESTAMP)",
        );
      if (reason === 'revoked') fixture.sqlite.exec('DELETE FROM session');
      if (reason === 'expired') fixture.sqlite.exec('UPDATE session SET expires_at = 1');
      if (reason === 'wrong-owner') fixture.sqlite.exec("UPDATE workspaces SET id = 'ws-other'");

      const resumed = new WorkspaceYDocDurableObject(state, env);
      await sendUpdate(resumed, socket, 'after');
      expect(socket.close).toHaveBeenCalledWith(1008, 'Workspace access denied');
      expect(socket.send).not.toHaveBeenCalled();
      const restored = new Y.Doc();
      try {
        const response = await new WorkspaceYDocDurableObject(state, env).fetch(
          new Request('http://localhost/state'),
        );
        Y.applyUpdate(restored, new Uint8Array(await response.arrayBuffer()));
        expect(restored.getMap('fields').get('name')).toBe('before');
      } finally {
        restored.destroy();
      }
    },
  );

  it('excludes revoked receivers from broadcasts', async () => {
    const origin = createSocket();
    const receiver = createSocket('revoked-session');
    const allowed = createSocket();
    vi.mocked(state.getWebSockets).mockReturnValue([
      origin,
      receiver,
      allowed,
    ] as unknown as WebSocket[]);
    await sendUpdate(object, origin, 'allowed');
    await Promise.all(vi.mocked(state.waitUntil).mock.calls.map(([promise]) => promise));
    expect(receiver.send).not.toHaveBeenCalled();
    expect(receiver.close).toHaveBeenCalledWith(1008, 'Workspace access denied');
    expect(origin.send).toHaveBeenCalledTimes(1);
    expect(allowed.send).toHaveBeenCalledTimes(1);
  });

  it('closes legacy attachments without session identity', async () => {
    const socket = createSocket(null);
    await sendUpdate(object, socket, 'rejected');
    expect(socket.close).toHaveBeenCalledWith(1008, 'Workspace access denied');
    expect(socket.send).not.toHaveBeenCalled();
    expect(state.storage.put).not.toHaveBeenCalled();
  });

  it('fails closed when session validation is unavailable', async () => {
    const socket = createSocket();
    vi.spyOn(fixture.database, 'prepare').mockImplementation(() => {
      throw new Error('database unavailable');
    });
    await expect(sendUpdate(object, socket, 'rejected')).rejects.toThrow('database unavailable');
    expect(socket.close).toHaveBeenCalledWith(1011, 'Workspace authorization unavailable');
    expect(socket.send).not.toHaveBeenCalled();
    expect(state.storage.put).not.toHaveBeenCalled();
  });
});
