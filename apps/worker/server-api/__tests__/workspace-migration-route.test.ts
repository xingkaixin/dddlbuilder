import { describe, expect, it } from 'vitest';
import type { ApiEnv } from '../lib/context.js';

// SAFETY: Migration route tests provide the bindings read before the mocked migration service is called.
const createEnv = (overrides: Partial<ApiEnv['Bindings']> = {}): ApiEnv['Bindings'] => ({
  ASSETS: { fetch: globalThis.fetch },
  SHARE_KV: {} as KVNamespace,
  USER_DB: {} as D1Database,
  BETTER_AUTH_SECRET: 'better-auth-secret',
  BETTER_AUTH_URL: 'http://localhost:3000',
  RESEND_API_KEY: 're_test_key',
  RESEND_FROM_EMAIL: 'noreply@example.com',
  RESEND_FROM_NAME: 'DDLBuilder',
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
});
