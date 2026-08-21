import { expect, test } from '@playwright/test';

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
    const workspaceList = (await workspacesResponse.json()) as {
      activeWorkspaceId: string;
      workspaces: Array<{ id: string; isDefault: boolean }>;
    };
    const workspaceId = workspaceList.activeWorkspaceId;
    expect(workspaceList.workspaces).toContainEqual(
      expect.objectContaining({ id: workspaceId, isDefault: true }),
    );

    const state = createState(`runtime_${Date.now()}`);
    const importResponse = await context.request.post(`/api/workspaces/${workspaceId}/yjs/import`, {
      data: {
        globalDraft: null,
        drafts: [
          {
            draftId: 'runtime-draft',
            state,
            updatedAt: Date.now(),
          },
        ],
        savedTables: [],
        savedDrafts: [],
        folders: [],
      },
    });
    expect(importResponse.ok(), await importResponse.text()).toBe(true);

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
    expect((await durableObjectResponse.body()).byteLength).toBeGreaterThan(0);
  });
});
