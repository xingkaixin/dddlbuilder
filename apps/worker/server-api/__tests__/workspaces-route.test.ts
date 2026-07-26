import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from '../lib/context.js';
import type * as WorkspaceEntitiesModule from '../lib/workspaceEntities.js';

const createEnv = (overrides: Partial<ApiEnv['Bindings']> = {}): ApiEnv['Bindings'] => ({
  ASSETS: { fetch: globalThis.fetch },
  SHARE_KV: {} as KVNamespace,
  USER_DB: {} as D1Database,
  BETTER_AUTH_SECRET: 'better-auth-secret',
  BETTER_AUTH_URL: 'http://localhost:3000',
  RESEND_API_KEY: 're_test_key',
  RESEND_FROM_EMAIL: 'noreply@example.com',
  RESEND_FROM_NAME: 'DDLBuilder',
  TURNSTILE_SECRET_KEY: 'turnstile-secret',
  SIGNUP_BONUS_CREDITS: '100000',
  ...overrides,
});

const createRequest = (path: string, init: RequestInit = {}) =>
  new Request(`http://localhost${path}`, init);

describe('/api/workspaces', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns 401 for anonymous workspace list requests', async () => {
    const { default: app } = await import('../../api/index');
    const response = await app.fetch(createRequest('/api/workspaces'), createEnv());

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      code: 'AUTH_REQUIRED',
    });
  });

  it('returns workspace list for authenticated users', async () => {
    vi.doMock('../lib/auth.js', () => ({
      authenticateRequest: vi.fn().mockResolvedValue({
        userId: 'user-1',
        email: 'user@example.com',
        emailVerified: true,
        name: 'User One',
      }),
    }));
    vi.doMock('../lib/workspaceEntities.js', async (importOriginal) => {
      const actual = await importOriginal<typeof WorkspaceEntitiesModule>();
      return {
        ...actual,
        listWorkspaces: vi.fn().mockResolvedValue({
          activeWorkspaceId: 'ws-1',
          workspaces: [{ id: 'ws-1', name: 'Default Workspace', isDefault: true, updatedAt: 1 }],
        }),
      };
    });

    const { default: app } = await import('../../api/index');
    const response = await app.fetch(createRequest('/api/workspaces'), createEnv());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      activeWorkspaceId: 'ws-1',
      workspaces: [{ id: 'ws-1', isDefault: true }],
    });
  });

  it('pulls workspace changes with a cursor', async () => {
    const getWorkspaceChanges = vi.fn().mockResolvedValue({
      workspaceId: 'ws-1',
      cursor: 2,
      entities: [],
    });
    vi.doMock('../lib/auth.js', () => ({
      authenticateRequest: vi.fn().mockResolvedValue({
        userId: 'user-1',
        email: 'user@example.com',
        emailVerified: true,
        name: 'User One',
      }),
    }));
    vi.doMock('../lib/workspaceEntities.js', async (importOriginal) => {
      const actual = await importOriginal<typeof WorkspaceEntitiesModule>();
      return {
        ...actual,
        getWorkspaceChanges,
      };
    });

    const { default: app } = await import('../../api/index');
    const response = await app.fetch(
      createRequest('/api/workspaces/ws-1/changes?since=1'),
      createEnv(),
    );

    expect(response.status).toBe(200);
    expect(getWorkspaceChanges).toHaveBeenCalledWith(expect.anything(), 'user-1', 'ws-1', 1);
  });

  it('rejects invalid change push payloads', async () => {
    vi.doMock('../lib/auth.js', () => ({
      authenticateRequest: vi.fn().mockResolvedValue({
        userId: 'user-1',
        email: 'user@example.com',
        emailVerified: true,
        name: 'User One',
      }),
    }));

    const { default: app } = await import('../../api/index');
    const response = await app.fetch(
      createRequest('/api/workspaces/ws-1/changes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ changes: [{ entityType: 'bad' }] }),
      }),
      createEnv(),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: 'INVALID_JSON',
    });
  });

  it('pushes valid workspace changes', async () => {
    const pushWorkspaceChanges = vi.fn().mockResolvedValue({
      cursor: 1,
      accepted: [{ clientMutationId: 'm-1', entityType: 'draft', entityId: 'd-1', version: 1 }],
      conflicts: [],
    });
    vi.doMock('../lib/auth.js', () => ({
      authenticateRequest: vi.fn().mockResolvedValue({
        userId: 'user-1',
        email: 'user@example.com',
        emailVerified: true,
        name: 'User One',
      }),
    }));
    vi.doMock('../lib/workspaceEntities.js', async (importOriginal) => {
      const actual = await importOriginal<typeof WorkspaceEntitiesModule>();
      return {
        ...actual,
        pushWorkspaceChanges,
      };
    });

    const { default: app } = await import('../../api/index');
    const response = await app.fetch(
      createRequest('/api/workspaces/ws-1/changes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          changes: [
            {
              clientMutationId: 'm-1',
              entityType: 'draft',
              entityId: 'd-1',
              op: 'upsert',
              baseVersion: null,
              contentHash: 'sha256:1',
              payload: { state: { tableName: 'users' } },
            },
          ],
        }),
      }),
      createEnv(),
    );

    expect(response.status).toBe(200);
    expect(pushWorkspaceChanges).toHaveBeenCalledTimes(1);
    expect(await response.json()).toMatchObject({
      cursor: 1,
      accepted: [{ clientMutationId: 'm-1', version: 1 }],
    });
  });
});
