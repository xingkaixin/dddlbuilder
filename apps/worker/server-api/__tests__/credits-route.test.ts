import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from '../lib/context.js';

// SAFETY: Route tests only read ASSETS and the mocked account bindings from this environment fixture.
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

describe('/api/credits/*', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns 401 for anonymous balance requests', async () => {
    const { default: app } = await import('../../api/index');
    const response = await app.fetch(createRequest('/api/credits/balance'), createEnv());

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      code: 'AUTH_REQUIRED',
    });
  });

  it('rejects invalid account output instead of returning a successful balance', async () => {
    // oxlint-disable-next-line anti-slop/no-module-mocking -- Replace authentication at the route boundary to exercise the response contract.
    vi.doMock('../lib/auth.js', () => ({
      resolveAuthenticatedUser: vi.fn().mockResolvedValue({ userId: 'user-1' }),
    }));
    // oxlint-disable-next-line anti-slop/no-module-mocking -- Replace credit persistence so this route test controls account outcomes.
    vi.doMock('../lib/credits.js', () => ({
      readCreditBalance: vi.fn().mockResolvedValue({ balance: -1, version: 0 }),
      listCreditLedger: vi.fn(),
      countCreditLedger: vi.fn(),
    }));
    const { default: app } = await import('../../api/index');
    const response = await app.fetch(createRequest('/api/credits/balance'), createEnv());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  });

  it('returns 503 when balance service throws', async () => {
    // oxlint-disable-next-line anti-slop/no-module-mocking -- Replace authentication at the route boundary to exercise the response contract.
    vi.doMock('../lib/auth.js', () => ({
      resolveAuthenticatedUser: vi.fn().mockResolvedValue({
        userId: 'user-1',
        email: 'user@example.com',
        emailVerified: true,
        name: 'User One',
      }),
    }));
    // oxlint-disable-next-line anti-slop/no-module-mocking -- Replace credit persistence so this route test controls account outcomes.
    vi.doMock('../lib/credits.js', () => ({
      readCreditBalance: vi.fn().mockRejectedValue(new Error('DB down')),
      listCreditLedger: vi.fn(),
      countCreditLedger: vi.fn(),
    }));

    const { default: app } = await import('../../api/index');
    const response = await app.fetch(createRequest('/api/credits/balance'), createEnv());

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: 'Credit service unavailable',
      code: 'SERVICE_UNAVAILABLE',
    });
  });
});
