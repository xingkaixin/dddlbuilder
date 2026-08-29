import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from '../lib/context.js';
import type * as WorkspaceEntitiesModule from '../lib/workspaceEntities.js';

const createYDocNamespace = (fetch: ReturnType<typeof vi.fn>) =>
  ({
    idFromName: vi.fn((name: string) => ({ name })),
    get: vi.fn(() => ({ fetch })),
  }) as unknown as DurableObjectNamespace;

const createEnv = (overrides: Partial<ApiEnv['Bindings']> = {}): ApiEnv['Bindings'] => ({
  ASSETS: { fetch: globalThis.fetch },
  SHARE_KV: {} as KVNamespace,
  USER_DB: {} as D1Database,
  WORKSPACE_YDOC: createYDocNamespace(vi.fn().mockResolvedValue(new Response('ok'))),
  BETTER_AUTH_SECRET: 'better-auth-secret',
  BETTER_AUTH_URL: 'http://localhost:3000',
  ...overrides,
});

const createRequest = (path: string, init: RequestInit = {}) =>
  new Request(`http://localhost${path}`, init);

const createState = () => ({
  schemaName: '',
  tableName: 'users',
  tableComment: '',
  dbType: 'mysql',
  sqlFormatMode: 'compact',
  rows: [],
  addCount: 12,
  indexes: [],
  authInput: '',
  authObjects: [],
});

describe('/api/workspaces/:workspaceId/yjs', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns 401 for anonymous websocket requests', async () => {
    vi.doMock('../lib/auth.js', async (importOriginal) => {
      const actual = await importOriginal<Record<string, unknown>>();
      const { DomainError } = await import('../lib/http.js');
      return {
        ...actual,
        authenticateRequest: vi
          .fn()
          .mockRejectedValue(new DomainError(401, 'AUTH_REQUIRED', 'AUTH_REQUIRED')),
      };
    });

    const { default: app } = await import('../../api/index');
    const response = await app.fetch(createRequest('/api/workspaces/ws-1/yjs'), createEnv());

    expect(response.status).toBe(401);
  });

  it('returns 403 when workspace ownership check fails', async () => {
    vi.doMock('../lib/auth.js', () => ({
      authenticateRequest: vi.fn().mockResolvedValue({
        userId: 'user-1',
        sessionId: 'session-1',
        email: 'user@example.com',
        emailVerified: true,
        name: 'User One',
      }),
    }));
    vi.doMock('../lib/workspaceEntities.js', async (importOriginal) => {
      const actual = await importOriginal<typeof WorkspaceEntitiesModule>();
      return {
        ...actual,
        assertWorkspaceOwner: vi.fn().mockRejectedValue(new actual.WorkspaceNotFoundError()),
      };
    });

    const { default: app } = await import('../../api/index');
    const response = await app.fetch(createRequest('/api/workspaces/ws-1/yjs'), createEnv());

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'WORKSPACE_ACCESS_DENIED' });
  });

  it('forwards authorized state requests to the durable object', async () => {
    const stubFetch = vi.fn().mockResolvedValue(new Response('state'));
    vi.doMock('../lib/auth.js', () => ({
      authenticateRequest: vi.fn().mockResolvedValue({
        userId: 'user-1',
        sessionId: 'session-1',
        email: 'user@example.com',
        emailVerified: true,
        name: 'User One',
      }),
    }));
    vi.doMock('../lib/workspaceEntities.js', async (importOriginal) => {
      const actual = await importOriginal<typeof WorkspaceEntitiesModule>();
      return {
        ...actual,
        assertWorkspaceOwner: vi.fn().mockResolvedValue(undefined),
      };
    });

    const { default: app } = await import('../../api/index');
    const response = await app.fetch(
      createRequest('/api/workspaces/ws-1/yjs/state', {
        headers: { 'x-ddlbuilder-session-id': 'untrusted-session' },
      }),
      createEnv({ WORKSPACE_YDOC: createYDocNamespace(stubFetch) }),
    );

    expect(response.status).toBe(200);
    const [forwarded] = stubFetch.mock.calls[0] as [Request];
    expect(forwarded.headers.get('x-ddlbuilder-workspace-id')).toBe('ws-1');
    expect(forwarded.headers.get('x-ddlbuilder-user-id')).toBe('user-1');
    expect(forwarded.headers.get('x-ddlbuilder-session-id')).toBe('session-1');
  });

  it('returns 204 for authorized websocket health preflight', async () => {
    const stubFetch = vi.fn().mockResolvedValue(new Response('state'));
    vi.doMock('../lib/auth.js', () => ({
      authenticateRequest: vi.fn().mockResolvedValue({
        userId: 'user-1',
        sessionId: 'session-1',
        email: 'user@example.com',
        emailVerified: true,
        name: 'User One',
      }),
    }));
    vi.doMock('../lib/workspaceEntities.js', async (importOriginal) => {
      const actual = await importOriginal<typeof WorkspaceEntitiesModule>();
      return {
        ...actual,
        assertWorkspaceOwner: vi.fn().mockResolvedValue(undefined),
      };
    });

    const { default: app } = await import('../../api/index');
    const response = await app.fetch(
      createRequest('/api/workspaces/ws-1/yjs', { method: 'HEAD' }),
      createEnv({ WORKSPACE_YDOC: createYDocNamespace(stubFetch) }),
    );

    expect(response.status).toBe(204);
    expect(stubFetch).not.toHaveBeenCalled();
  });

  it('validates import payload before forwarding', async () => {
    const stubFetch = vi.fn().mockResolvedValue(new Response('imported'));
    vi.doMock('../lib/auth.js', () => ({
      authenticateRequest: vi.fn().mockResolvedValue({
        userId: 'user-1',
        sessionId: 'session-1',
        email: 'user@example.com',
        emailVerified: true,
        name: 'User One',
      }),
    }));
    vi.doMock('../lib/workspaceEntities.js', async (importOriginal) => {
      const actual = await importOriginal<typeof WorkspaceEntitiesModule>();
      return {
        ...actual,
        assertWorkspaceOwner: vi.fn().mockResolvedValue(undefined),
      };
    });

    const { default: app } = await import('../../api/index');
    const env = createEnv({ WORKSPACE_YDOC: createYDocNamespace(stubFetch) });
    const invalid = await app.fetch(
      createRequest('/api/workspaces/ws-1/yjs/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ savedTables: [] }),
      }),
      env,
    );
    expect(invalid.status).toBe(400);
    expect(stubFetch).not.toHaveBeenCalled();

    const invalidState = await app.fetch(
      createRequest('/api/workspaces/ws-1/yjs/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          globalDraft: { state: {}, updatedAt: 1 },
          drafts: [],
          savedTables: [],
          savedDrafts: [],
          folders: [],
        }),
      }),
      env,
    );
    expect(invalidState.status).toBe(400);
    expect(stubFetch).not.toHaveBeenCalled();

    const valid = await app.fetch(
      createRequest('/api/workspaces/ws-1/yjs/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          globalDraft: { state: createState(), updatedAt: 1 },
          drafts: [],
          savedTables: [],
          savedDrafts: [],
          folders: [],
        }),
      }),
      env,
    );

    expect(valid.status).toBe(200);
    expect(stubFetch).toHaveBeenCalledTimes(1);
  });
});
