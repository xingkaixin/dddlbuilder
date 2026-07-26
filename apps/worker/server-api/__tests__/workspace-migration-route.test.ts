import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from '../lib/context.js';

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

const samplePayload = {
  localFingerprint: 'fingerprint-1',
  idempotencyKey: 'migration-1',
  snapshot: {
    globalDraft: null,
    activeSession: null,
    savedTables: [],
    savedDrafts: [],
  },
};

describe('/api/workspace/migrations', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns 401 for anonymous migration requests', async () => {
    const { default: app } = await import('../../api/index');
    const response = await app.fetch(
      createRequest('/api/workspace/migrations', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          mode: 'analyze',
          payload: samplePayload,
        }),
      }),
      createEnv(),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      code: 'AUTH_REQUIRED',
    });
  });

  it('returns analyze result for authenticated users', async () => {
    vi.doMock('../lib/auth.js', () => ({
      authenticateRequest: vi.fn().mockResolvedValue({
        userId: 'user-1',
        email: 'user@example.com',
        emailVerified: true,
        name: 'User One',
      }),
    }));
    vi.doMock('../lib/workspaceMigration.js', () => ({
      analyzeWorkspaceMigration: vi.fn().mockResolvedValue({
        status: 'ready',
        createdCount: 2,
        copiedCount: 0,
        skippedCount: 1,
        conflictCount: 1,
        conflicts: [{ kind: 'saved_table', normalizedName: 'users', displayName: 'users' }],
      }),
      commitWorkspaceMigration: vi.fn(),
    }));

    const { default: app } = await import('../../api/index');
    const response = await app.fetch(
      createRequest('/api/workspace/migrations', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          mode: 'analyze',
          payload: samplePayload,
        }),
      }),
      createEnv(),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'ready',
      conflictCount: 1,
    });
  });

  it('returns commit result for authenticated users', async () => {
    vi.doMock('../lib/auth.js', () => ({
      authenticateRequest: vi.fn().mockResolvedValue({
        userId: 'user-1',
        email: 'user@example.com',
        emailVerified: true,
        name: 'User One',
      }),
    }));
    vi.doMock('../lib/workspaceMigration.js', () => ({
      analyzeWorkspaceMigration: vi.fn(),
      commitWorkspaceMigration: vi.fn().mockResolvedValue({
        status: 'completed',
        createdCount: 2,
        copiedCount: 1,
        skippedCount: 0,
        conflictCount: 0,
        conflicts: [],
      }),
    }));

    const { default: app } = await import('../../api/index');
    const response = await app.fetch(
      createRequest('/api/workspace/migrations', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          mode: 'commit',
          payload: samplePayload,
        }),
      }),
      createEnv(),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'completed',
      copiedCount: 1,
    });
  });
});
