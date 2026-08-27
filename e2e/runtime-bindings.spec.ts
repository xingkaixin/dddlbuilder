import { expect, test } from '@playwright/test';
import * as Y from 'yjs';
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
