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
  indexes: [],
  authInput: '',
  authObjects: [],
  foreignKeys: [],
});

test.describe('Cloudflare runtime bindings', () => {
  test('enforces strict SQL snapshots without changing ordinary imports', async ({ request }) => {
    const sql = 'CREATE TABLE users(id INT PRIMARY KEY); SELECT 1;';

    const strict = await request.post('/api/parse-multi-sql', {
      data: { sql, dbType: 'mysql', strict: true },
    });
    expect(strict.ok(), await strict.text()).toBe(true);
    expect(await strict.json()).toMatchObject({
      results: [{ tableName: 'users' }],
      failed: [{ error: expect.any(String) }],
    });
    const ordinary = await request.post('/api/parse-multi-sql', { data: { sql, dbType: 'mysql' } });
    expect(ordinary.ok(), await ordinary.text()).toBe(true);
    expect(await ordinary.json()).toMatchObject({ results: [{ tableName: 'users' }], failed: [] });
  });

  for (const path of [
    '/',
    '/docs/zh/basic/getting-started',
    '/docs/en/basic/getting-started',
    '/docs/ja/basic/getting-started',
  ]) {
    test(`serves ${path} with an enforced CSP`, async ({ page }) => {
      await page.route(/^https:\/\//, (route) => route.fulfill({ body: '' }));
      await page.addInitScript(() => {
        document.addEventListener('securitypolicyviolation', (event) => {
          document.documentElement.dataset.cspViolation = `${event.violatedDirective}: ${event.blockedURI}`;
        });
      });
      const response = await page.goto(path);
      expect(response?.ok()).toBe(true);
      const policy = response?.headers()['content-security-policy'];
      expect(policy).toContain("frame-ancestors 'none'");
      expect(policy).toContain("'sha256-");
      expect(policy).not.toContain("'unsafe-eval'");

      if (path === '/') {
        await expect(page.locator('#root')).not.toBeEmpty();
      } else {
        await expect(page.locator('.VPDoc h1')).toBeVisible();
        await page.getByRole('switch').click();
      }

      expect(await page.locator('html').getAttribute('data-csp-violation')).toBeNull();
    });
  }

  test('connects Effect spans to the native Worker trace', async ({ request }) => {
    const requestId = `trace-${crypto.randomUUID()}`;

    const response = await request.post('/api/explain', {
      headers: { 'X-Request-Id': requestId },
      data: {},
    });
    expect(response.status()).toBe(401);

    const sql = `WITH root AS (
      SELECT span_id FROM spans WHERE name = 'ai.request'
      AND json_extract(attributes, '$."request.id"') = '${requestId}'
    ) SELECT name, span_id, parent_id, json(attributes) FROM spans
      WHERE span_id IN (SELECT span_id FROM root) OR parent_id IN (SELECT span_id FROM root)`;
    let rows: string[][] = [];
    await expect
      .poll(async () => {
        const query = await request.post('/cdn-cgi/local/explorer/api/local/observability/query', {
          data: { sql },
        });
        expect(query.ok()).toBe(true);
        const payload = await query.json();
        expect(payload.success).toBe(true);
        rows = payload.result.rows;

        return rows.map((row) => row[0]);
      })
      .toEqual(expect.arrayContaining(['ai.request', 'ai.authenticate']));
    const root = rows.find((row) => row[0] === 'ai.request');
    const auth = rows.find((row) => row[0] === 'ai.authenticate');

    if (!root || !auth) throw new Error('Missing AI runtime spans');
    expect(auth[2]).toBe(root[1]);
    expect(JSON.parse(root[3])).toMatchObject({
      'request.id': requestId,
      'ai.outcome': 'rejected',
      'ai.error_code': 'AUTH_REQUIRED',
    });
  });

  test('runs Effect D1 recovery in a scheduled Worker', async ({ request }) => {
    const response = await request.get('/cdn-cgi/local/scheduled?format=json');
    expect(response.ok(), await response.text()).toBe(true);
    expect(await response.json()).toMatchObject({ outcome: 'ok' });

    const sql = `WITH RECURSIVE recovery AS (
      SELECT name, span_id, parent_id, attributes FROM spans WHERE name = 'ai.usage.recovery'
      UNION ALL
      SELECT s.name, s.span_id, s.parent_id, s.attributes FROM spans s
      JOIN recovery r ON s.parent_id = r.span_id
    ) SELECT name, span_id, parent_id, json(attributes) FROM recovery`;
    let rows: string[][] = [];
    await expect
      .poll(async () => {
        const query = await request.post('/cdn-cgi/local/explorer/api/local/observability/query', {
          data: { sql },
        });
        expect(query.ok()).toBe(true);
        const payload = await query.json();
        expect(payload.success).toBe(true);
        rows = payload.result.rows;

        return rows.map((row) => row[0]);
      })
      .toEqual(
        expect.arrayContaining([
          'ai.usage.recovery',
          'ai.usage.reclaim.scan',
          'sql.execute',
          'ai.budget.reconcile',
          'ai.governance.cleanup',
        ]),
      );
    const scan = rows.find((row) => row[0] === 'ai.usage.reclaim.scan');
    const query = rows.find((row) => row[0] === 'sql.execute' && row[2] === scan?.[1]);

    if (!query) throw new Error('Missing recovery SQL span');
    expect(JSON.parse(query[3])).toMatchObject({ 'ai.outcome': 'succeeded' });
    expect(JSON.parse(query[3])).not.toHaveProperty('db.query.text');
  });

  test('revokes an established workspace socket after sign-out', async ({ context, page }) => {
    const email = `socket-${crypto.randomUUID()}@ddlbuilder.test`;
    const password = 'Runtime-integration-123!';

    const signup = await context.request.post('/api/auth/sign-up/email', {
      data: {
        name: 'Socket Integration',
        email,
        password,
      },
    });
    expect(signup.ok(), await signup.text()).toBe(true);
    const response = await context.request.get('/api/workspaces');
    expect(response.ok(), await response.text()).toBe(true);
    // SAFETY: The local workspace endpoint returns the asserted workspaceId contract after the successful response check.
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
        data: { email, password },
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

  test('persists auth, workspace, share and Durable Object state', async ({ context, page }) => {
    const email = `runtime-${crypto.randomUUID()}@ddlbuilder.test`;

    const signup = await context.request.post('/api/auth/sign-up/email', {
      data: {
        name: 'Runtime Integration',
        email,
        password: 'Runtime-integration-123!',
      },
    });
    expect(signup.ok(), await signup.text()).toBe(true);

    const meResponse = await context.request.get('/api/me');
    expect(meResponse.ok()).toBe(true);

    // SAFETY: The authenticated /api/me test fixture is known to return this signedIn/user shape.
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
    // SAFETY: The local workspace endpoint returns a string workspaceId after the successful response check.
    const currentWorkspace = (await workspacesResponse.json()) as { workspaceId: string };
    const { workspaceId } = currentWorkspace;
    expect(workspaceId).toMatch(/^ws_/);

    await page.goto('/api/health');

    const closed = await page.evaluate(
      (id) =>
        new Promise((resolve, reject) => {
          const socket = new WebSocket(`ws://${location.host}/api/workspaces/${id}/yjs`);
          socket.onopen = () => socket.close(1000, 'done');
          socket.onerror = () => reject(new Error('Workspace socket failed to open'));
          socket.onclose = ({ code, reason, wasClean }) => resolve({ code, reason, wasClean });
        }),
      workspaceId,
    );

    expect(closed).toEqual({ code: 1000, reason: 'done', wasClean: true });

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
        // SAFETY: Each response was checked successful above and comes from the migration route exercised by this test.
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
    // SAFETY: The local share endpoint returns an id for a successful create response.
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

test('persists publications, freezes proposals and enforces access after revocation', async ({
  context,
  browser,
  request,
  baseURL,
  page,
}, testInfo) => {
  const signup = await context.request.post('/api/auth/sign-up/email', {
    data: {
      name: 'Publication Owner',
      email: `publication-${crypto.randomUUID()}@ddlbuilder.test`,
      password: 'Runtime-integration-123!',
    },
  });
  expect(signup.ok(), await signup.text()).toBe(true);

  const table = {
    ...createState('published_users'),
    rows: [
      {
        id: 'id',
        fieldName: 'id',
        fieldType: 'int',
        fieldComment: '业务主键',
        nullable: false,
        standardId: 'identity',
      },
    ],
  };
  const input = {
    title: '项目数据库文档',
    visibility: 'private',
    revision: 0,
    content: {
      kind: 'document',
      tables: [table],
      standards: [{ id: 'identity', name: '用户编号', description: '稳定业务标识', unit: '' }],
    },
  };
  const crossOrigin = await context.request.post('/api/publications', {
    headers: { Origin: 'https://untrusted.example' },
    data: input,
  });
  expect(crossOrigin.status()).toBe(403);

  const wrongType = await context.request.post('/api/publications', {
    headers: { 'content-type': 'text/plain' },
    data: JSON.stringify(input),
  });
  expect(wrongType.status()).toBe(415);

  const malformed = await context.request.post('/api/publications', {
    data: { ...input, content: { ...input.content, tables: [{}] } },
  });
  expect(malformed.status()).toBe(400);
  const unauthenticated = await request.post('/api/publications', { data: input });
  expect(unauthenticated.status()).toBe(401);
  const created = await context.request.post('/api/publications', { data: input });
  expect(created.status(), await created.text()).toBe(201);
  const publication: { id: string; revision: number } = await created.json();
  const path = `/api/publications/${publication.id}`;
  expect((await request.get(path)).status()).toBe(404);
  const update = { ...input, visibility: 'link', revision: 1 };
  expect((await context.request.put(path, { data: update })).ok()).toBe(true);
  expect((await context.request.put(path, { data: update })).status()).toBe(409);
  const readable = await request.get(path);
  expect(readable.ok()).toBe(true);
  expect(readable.headers()['cache-control']).toBe('no-store');
  expect(readable.headers()['x-robots-tag']).toContain('noindex');
  expect(await readable.json()).toMatchObject({
    id: publication.id,
    revision: 2,
    isOwner: false,
    content: { standards: input.content.standards },
  });
  await page.route(/^https:\/\//, (route) => route.fulfill({ body: '' }));
  await page.goto(`/publications/${publication.id}`);
  await expect(page.getByRole('heading', { name: '项目数据库文档', exact: true })).toBeVisible();
  await expect(page.getByText(/稳定业务标识/)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('publication-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.getByRole('heading', { name: 'published_users', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('publication-mobile-dark.png') });
  await page.reload();
  await expect(page.getByText(/稳定业务标识/)).toBeVisible();
  const reader = await browser.newContext({ baseURL });

  try {
    const readerSignup = await reader.request.post('/api/auth/sign-up/email', {
      data: {
        name: 'Publication Reader',
        email: `reader-${crypto.randomUUID()}@ddlbuilder.test`,
        password: 'Runtime-integration-123!',
      },
    });
    expect(readerSignup.ok(), await readerSignup.text()).toBe(true);
    expect((await reader.request.put(path, { data: { ...update, revision: 2 } })).status()).toBe(
      404,
    );

    const proposalInput = {
      title: '增加用户表',
      visibility: 'link',
      revision: 0,
      content: { kind: 'proposal', reason: '业务需求', before: [], after: [table], renames: [] },
    };
    const proposalResponse = await context.request.post('/api/publications', {
      data: proposalInput,
    });
    expect(proposalResponse.ok(), await proposalResponse.text()).toBe(true);
    const proposal: { id: string } = await proposalResponse.json();
    const proposalPath = `/api/publications/${proposal.id}`;
    expect(
      (
        await context.request.put(proposalPath, {
          data: {
            ...proposalInput,
            revision: 1,
            content: { ...proposalInput.content, reason: 'changed' },
          },
        })
      ).status(),
    ).toBe(400);

    const commented = await reader.request.post(`${proposalPath}/comments`, {
      data: { target: 'published_users.id', body: '<b>确认主键</b>' },
    });
    expect(commented.status(), await commented.text()).toBe(201);

    const comments: { id: string; resolved: boolean }[] = await (
      await request.get(`${proposalPath}/comments`)
    ).json();
    expect(comments).toHaveLength(1);
    expect(
      (
        await reader.request.put(`${proposalPath}/comments/${comments[0].id}`, {
          data: { resolved: true },
        })
      ).status(),
    ).toBe(404);
    await page.goto(`/publications/${proposal.id}`);
    await expect(page.getByText('<b>确认主键</b>', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '标记已处理', exact: true }).click();
    await expect(page.getByRole('button', { name: '重新打开', exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: '重新打开', exact: true })).toBeVisible();
    expect(
      (
        await context.request.put(proposalPath, {
          data: { ...proposalInput, revision: 1, visibility: 'private' },
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await reader.request.post(`${proposalPath}/comments`, {
          data: { target: '', body: 'Denied' },
        })
      ).status(),
    ).toBe(404);
    expect((await request.get(`${proposalPath}/comments`)).status()).toBe(404);
    expect((await context.request.delete(proposalPath, { data: {} })).ok()).toBe(true);
    expect((await context.request.get(proposalPath)).status()).toBe(404);
  } finally {
    await reader.close();
  }

  expect((await context.request.put(path, { data: { ...input, revision: 2 } })).ok()).toBe(true);
  expect((await request.get(path)).status()).toBe(404);
  expect((await context.request.delete(path, { data: {} })).ok()).toBe(true);
  expect((await context.request.get(path)).status()).toBe(404);
});
