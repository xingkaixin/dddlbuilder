import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from '../lib/context.js';

const createEnv = (overrides: Partial<ApiEnv['Bindings']> = {}): ApiEnv['Bindings'] => ({
  ASSETS: { fetch: globalThis.fetch },
  SHARE_KV: {} as KVNamespace,
  RATE_LIMIT_KV: {} as KVNamespace,
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

describe('/api/workspace/snapshot', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns 401 for anonymous requests', async () => {
    const { default: app } = await import('../../api/index');
    const response = await app.fetch(createRequest('/api/workspace/snapshot'), createEnv());

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      code: 'AUTH_REQUIRED',
    });
  });

  it('returns workspace snapshot for authenticated users', async () => {
    vi.doMock('../lib/auth.js', () => ({
      authenticateRequest: vi.fn().mockResolvedValue({
        userId: 'user-1',
        email: 'user@example.com',
        emailVerified: true,
        name: 'User One',
      }),
    }));
    vi.doMock('../lib/workspaceSnapshots.js', () => ({
      getWorkspaceSnapshot: vi.fn().mockResolvedValue({
        globalDraft: null,
        drafts: [],
        savedTables: [{ normalizedName: 'users', name: 'Users', state: {}, updatedAt: 10 }],
        savedDrafts: [],
        folders: [],
      }),
      putWorkspaceSnapshot: vi.fn(),
    }));

    const { default: app } = await import('../../api/index');
    const response = await app.fetch(createRequest('/api/workspace/snapshot'), createEnv());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      savedTables: [{ normalizedName: 'users', name: 'Users' }],
    });
  });

  it('accepts valid snapshot payload on put', async () => {
    const putWorkspaceSnapshot = vi.fn().mockResolvedValue(undefined);
    vi.doMock('../lib/auth.js', () => ({
      authenticateRequest: vi.fn().mockResolvedValue({
        userId: 'user-1',
        email: 'user@example.com',
        emailVerified: true,
        name: 'User One',
      }),
    }));
    vi.doMock('../lib/workspaceSnapshots.js', () => ({
      getWorkspaceSnapshot: vi.fn(),
      putWorkspaceSnapshot,
    }));

    const { default: app } = await import('../../api/index');
    const response = await app.fetch(
      createRequest('/api/workspace/snapshot', {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          globalDraft: {
            state: {
              tableName: 'users',
            },
            updatedAt: 1,
          },
          drafts: [],
          savedTables: [],
          savedDrafts: [],
          folders: [],
        }),
      }),
      createEnv(),
    );

    expect(response.status).toBe(200);
    expect(putWorkspaceSnapshot).toHaveBeenCalledTimes(1);
  });

  it('returns 503 when putWorkspaceSnapshot throws', async () => {
    const putWorkspaceSnapshot = vi.fn().mockRejectedValue(new Error('D1 constraint failed'));
    vi.doMock('../lib/auth.js', () => ({
      authenticateRequest: vi.fn().mockResolvedValue({
        userId: 'user-1',
        email: 'user@example.com',
        emailVerified: true,
        name: 'User One',
      }),
    }));
    vi.doMock('../lib/workspaceSnapshots.js', () => ({
      getWorkspaceSnapshot: vi.fn(),
      putWorkspaceSnapshot,
    }));

    const { default: app } = await import('../../api/index');
    const response = await app.fetch(
      createRequest('/api/workspace/snapshot', {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          globalDraft: {
            state: {
              tableName: 'users',
            },
            updatedAt: 1,
          },
          drafts: [],
          savedTables: [],
          savedDrafts: [],
          folders: [],
        }),
      }),
      createEnv(),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    });
  });
});
