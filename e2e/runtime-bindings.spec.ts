import { expect, test } from '@playwright/test';
import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as syncProtocol from 'y-protocols/sync';
import { WORKSPACE_SYNC_MESSAGE } from '../packages/shared-types/src/index';
import { exportWorkspaceYDocToSnapshot } from '../packages/workspace-core/src/index';
import type { WorkspaceMigrationResponse } from '../packages/shared-types/src/api';

const createState = (tableName: string) => ({
  schemaName: '',
  objectType: 'table',
  tableName,
  tableComment: '',
  dbType: 'mysql',
  sqlFormatMode: 'compact',
  viewDefinition: '',
  viewCreateOrReplace: true,
  rows: [],
  addCount: 10,
  indexInput: '',
  currentIndexFields: [],
  indexes: [],
  authInput: '',
  authObjects: [],
  foreignKeys: [],
});

test.describe('Cloudflare runtime bindings', () => {
  test('revokes an established workspace socket after sign-out', async ({ context, page }) => {
    const email = `socket-${crypto.randomUUID()}@ddlbuilder.test`;
    const password = 'Runtime-integration-123!';
    const signup = await context.request.post('/api/auth/sign-up/email', {
      data: {
        name: 'Socket Integration',
        email,
        password,
        turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX',
      },
    });
    expect(signup.ok(), await signup.text()).toBe(true);
    const response = await context.request.get('/api/workspaces');
    expect(response.ok(), await response.text()).toBe(true);
    const { workspaceId } = (await response.json()) as { workspaceId: string };
    const source = new Y.Doc();
    source.getMap('meta').set('schemaVersion', 1);
    const message = (value: string) => {
      source.getMap('authorizationProbe').set('value', value);
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, WORKSPACE_SYNC_MESSAGE.syncWithAck);
      encoding.writeVarUint(encoder, 1);
      encoding.writeVarUint(encoder, WORKSPACE_SYNC_MESSAGE.sync);
      syncProtocol.writeUpdate(encoder, Y.encodeStateAsUpdate(source));
      return [...encoding.toUint8Array(encoder)];
    };
    try {
      const allowed = message('before');
      const denied = message('after');
      await page.goto('/api/health');
      const closed = await page.evaluate(
        async ({ workspaceId, allowed, denied, persisted }) => {
          const socket = new WebSocket(`ws://${location.host}/api/workspaces/${workspaceId}/yjs`);
          socket.binaryType = 'arraybuffer';
          const opened = new Promise<void>((resolve, reject) => {
            socket.onopen = () => resolve();
            socket.onerror = () => reject(new Error('Workspace socket failed to open'));
          });
          const acknowledged = new Promise<void>((resolve, reject) => {
            socket.onmessage = (event: MessageEvent<ArrayBuffer>) => {
              if (new Uint8Array(event.data)[0] === persisted) resolve();
            };
            socket.onclose = (event) =>
              reject(new Error(`Socket closed before acknowledgement: ${event.code}`));
          });
          await opened;
          socket.send(new Uint8Array(allowed));
          await acknowledged;
          const closed = new Promise<number>((resolve) => {
            socket.onclose = (event) => resolve(event.code);
          });
          const signout = await fetch('/api/auth/sign-out', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{}',
          });
          if (!signout.ok) throw new Error(`Sign-out failed: ${signout.status}`);
          socket.send(new Uint8Array(denied));
          return closed;
        },
        { workspaceId, allowed, denied, persisted: WORKSPACE_SYNC_MESSAGE.persisted },
      );
      expect(closed).toBe(1008);

      const signin = await context.request.post('/api/auth/sign-in/email', {
        data: { email, password, turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX' },
      });
      expect(signin.ok(), await signin.text()).toBe(true);
      const current = await context.request.get(`/api/workspaces/${workspaceId}/yjs/state`);
      expect(current.ok()).toBe(true);
      const restored = new Y.Doc();
      try {
        Y.applyUpdate(restored, new Uint8Array(await current.body()));
        expect(restored.getMap('authorizationProbe').get('value')).toBe('before');
      } finally {
        restored.destroy();
      }
    } finally {
      source.destroy();
    }
  });

  test('persists auth, workspace, share and Durable Object state', async ({ context }) => {
    const email = `runtime-${crypto.randomUUID()}@ddlbuilder.test`;
    const signup = await context.request.post('/api/auth/sign-up/email', {
      data: {
        name: 'Runtime Integration',
        email,
        password: 'Runtime-integration-123!',
        turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX',
      },
    });
    expect(signup.ok(), await signup.text()).toBe(true);

    const meResponse = await context.request.get('/api/me');
    expect(meResponse.ok()).toBe(true);
    const me = (await meResponse.json()) as {
      signedIn: boolean;
      user: { email: string } | null;
    };
    expect(me).toMatchObject({
      signedIn: true,
      user: { email },
    });

    const workspacesResponse = await context.request.get('/api/workspaces');
    expect(workspacesResponse.ok()).toBe(true);
    const currentWorkspace = (await workspacesResponse.json()) as { workspaceId: string };
    const { workspaceId } = currentWorkspace;
    expect(workspaceId).toMatch(/^ws_/);

    const state = createState(`runtime_${Date.now()}`);
    const importedAt = Date.now();
    const importResponse = await context.request.post(`/api/workspaces/${workspaceId}/yjs/import`, {
      data: {
        globalDraft: null,
        drafts: [
          {
            draftId: 'runtime-draft',
            state,
            updatedAt: importedAt,
          },
        ],
        savedTables: [],
        savedDrafts: [],
        folders: [],
      },
    });
    expect(importResponse.ok(), await importResponse.text()).toBe(true);

    const migrations = ['version A', 'version B'].map((tableComment) => ({
      mode: 'commit',
      payload: {
        localFingerprint: crypto.randomUUID(),
        idempotencyKey: crypto.randomUUID(),
        snapshot: {
          globalDraft: null,
          activeSession: null,
          drafts: [],
          savedDrafts: [],
          folders: [],
          savedTables: [
            {
              tableId: 'runtime-conflict',
              normalizedName: 'migration_users',
              name: 'migration_users',
              state: { ...createState('migration_users'), tableComment },
              createdAt: 1,
              updatedAt: 2,
            },
          ],
        },
      },
    }));
    const migrationResponses = await Promise.all(
      migrations.map((data) => context.request.post('/api/workspace/migrations', { data })),
    );
    for (const response of migrationResponses) {
      expect(response.ok(), await response.text()).toBe(true);
    }
    const migrationResults = await Promise.all(
      migrationResponses.map(
        async (response) => (await response.json()) as WorkspaceMigrationResponse,
      ),
    );
    expect(migrationResults.map((result) => result.createdCount).sort((a, b) => a - b)).toEqual([
      0, 1,
    ]);
    expect(migrationResults.map((result) => result.copiedCount).sort((a, b) => a - b)).toEqual([
      0, 1,
    ]);
    const retry = await context.request.post('/api/workspace/migrations', { data: migrations[1] });
    expect(retry.ok(), await retry.text()).toBe(true);
    expect(await retry.json()).toMatchObject({ createdCount: 0, copiedCount: 0, skippedCount: 1 });

    const shareResponse = await context.request.post('/api/share', {
      data: { state },
    });
    expect(shareResponse.ok(), await shareResponse.text()).toBe(true);
    const share = (await shareResponse.json()) as { id: string };
    const sharedStateResponse = await context.request.get(`/api/share/${share.id}`);
    expect(sharedStateResponse.ok()).toBe(true);
    expect(await sharedStateResponse.json()).toMatchObject({
      id: share.id,
      state,
    });

    const durableObjectResponse = await context.request.get(
      `/api/workspaces/${workspaceId}/yjs/state`,
    );
    expect(durableObjectResponse.ok(), await durableObjectResponse.text()).toBe(true);
    expect(durableObjectResponse.headers()['content-type']).toBe('application/octet-stream');
    const doc = new Y.Doc();
    try {
      Y.applyUpdate(doc, new Uint8Array(await durableObjectResponse.body()));
      const snapshot = exportWorkspaceYDocToSnapshot(doc);
      expect(snapshot.savedTables.map((table) => table.state.tableComment).sort()).toEqual([
        'version A',
        'version B',
      ]);
      expect(snapshot.drafts).toEqual([
        expect.objectContaining({
          draftId: 'runtime-draft',
          state: expect.objectContaining({ tableName: state.tableName }),
        }),
      ]);

      const originalRecord = doc.getMap('drafts').get('runtime-draft');
      for (const [tableComment, updatedAt] of [
        ['updated', importedAt + 1],
        ['stale', importedAt],
      ] as const) {
        const response = await context.request.post(`/api/workspaces/${workspaceId}/yjs/import`, {
          data: {
            globalDraft: null,
            drafts: [{ draftId: 'runtime-draft', state: { ...state, tableComment }, updatedAt }],
            savedTables: [],
            savedDrafts: [],
            folders: [],
          },
        });
        expect(response.ok(), await response.text()).toBe(true);
        const current = await context.request.get(`/api/workspaces/${workspaceId}/yjs/state`);
        expect(current.ok()).toBe(true);
        Y.applyUpdate(doc, new Uint8Array(await current.body()));
        expect(doc.getMap('drafts').get('runtime-draft')).toBe(originalRecord);
        expect(exportWorkspaceYDocToSnapshot(doc).drafts[0]?.state.tableComment).toBe('updated');
        expect(exportWorkspaceYDocToSnapshot(doc).savedTables).toEqual(snapshot.savedTables);
      }
    } finally {
      doc.destroy();
    }
  });
});
