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

  it('returns balance for authenticated users', async () => {
    vi.doMock('../lib/auth.js', () => ({
      resolveAuthenticatedUser: vi.fn().mockResolvedValue({
        userId: 'user-1',
        email: 'user@example.com',
        emailVerified: true,
        name: 'User One',
      }),
    }));
    vi.doMock('../lib/credits.js', () => ({
      getCreditAccount: vi.fn().mockResolvedValue({
        userId: 'user-1',
        balance: 8800,
        version: 3,
        updatedAt: '2026-04-11T00:00:00Z',
      }),
      listCreditLedger: vi.fn(),
    }));

    const { default: app } = await import('../../api/index');
    const response = await app.fetch(createRequest('/api/credits/balance'), createEnv());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      balance: 8800,
      version: 3,
      userId: 'user-1',
    });
  });

  it('returns zero balance when account does not exist', async () => {
    vi.doMock('../lib/auth.js', () => ({
      resolveAuthenticatedUser: vi.fn().mockResolvedValue({
        userId: 'user-1',
        email: 'user@example.com',
        emailVerified: true,
        name: 'User One',
      }),
    }));
    vi.doMock('../lib/credits.js', () => ({
      getCreditAccount: vi.fn().mockResolvedValue(null),
      listCreditLedger: vi.fn(),
    }));

    const { default: app } = await import('../../api/index');
    const response = await app.fetch(createRequest('/api/credits/balance'), createEnv());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      balance: 0,
      version: 0,
      userId: 'user-1',
    });
  });

  it('returns recent ledger entries for authenticated users', async () => {
    vi.doMock('../lib/auth.js', () => ({
      resolveAuthenticatedUser: vi.fn().mockResolvedValue({
        userId: 'user-1',
        email: 'user@example.com',
        emailVerified: true,
        name: 'User One',
      }),
    }));
    vi.doMock('../lib/credits.js', () => ({
      getCreditAccount: vi.fn(),
      listCreditLedger: vi.fn().mockResolvedValue([
        {
          id: 'grant:signup',
          userId: 'user-1',
          kind: 'grant',
          source: 'signup_bonus',
          amount: 100000,
          balanceAfter: 100000,
          idempotencyKey: 'signup_bonus:user-1',
          relatedUsageId: null,
          metadataJson: '{"email":"user@example.com"}',
          createdAt: '2026-04-11T00:00:00Z',
        },
      ]),
    }));

    const { default: app } = await import('../../api/index');
    const response = await app.fetch(createRequest('/api/credits/ledger?limit=10'), createEnv());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      items: [
        {
          kind: 'grant',
          source: 'signup_bonus',
          amount: 100000,
        },
      ],
    });
  });

  it('caps ledger limit at 50', async () => {
    const listCreditLedger = vi.fn().mockResolvedValue([]);
    vi.doMock('../lib/auth.js', () => ({
      resolveAuthenticatedUser: vi.fn().mockResolvedValue({
        userId: 'user-1',
        email: 'user@example.com',
        emailVerified: true,
        name: 'User One',
      }),
    }));
    vi.doMock('../lib/credits.js', () => ({
      getCreditAccount: vi.fn(),
      listCreditLedger,
    }));

    const { default: app } = await import('../../api/index');
    const response = await app.fetch(createRequest('/api/credits/ledger?limit=100'), createEnv());

    expect(response.status).toBe(200);
    expect(listCreditLedger).toHaveBeenCalledWith(expect.anything(), 'user-1', 50);
  });

  it('falls back to default limit for invalid values', async () => {
    const listCreditLedger = vi.fn().mockResolvedValue([]);
    vi.doMock('../lib/auth.js', () => ({
      resolveAuthenticatedUser: vi.fn().mockResolvedValue({
        userId: 'user-1',
        email: 'user@example.com',
        emailVerified: true,
        name: 'User One',
      }),
    }));
    vi.doMock('../lib/credits.js', () => ({
      getCreditAccount: vi.fn(),
      listCreditLedger,
    }));

    const { default: app } = await import('../../api/index');
    const response = await app.fetch(createRequest('/api/credits/ledger?limit=abc'), createEnv());

    expect(response.status).toBe(200);
    expect(listCreditLedger).toHaveBeenCalledWith(expect.anything(), 'user-1', 20);
  });

  it('falls back to default limit for zero', async () => {
    const listCreditLedger = vi.fn().mockResolvedValue([]);
    vi.doMock('../lib/auth.js', () => ({
      resolveAuthenticatedUser: vi.fn().mockResolvedValue({
        userId: 'user-1',
        email: 'user@example.com',
        emailVerified: true,
        name: 'User One',
      }),
    }));
    vi.doMock('../lib/credits.js', () => ({
      getCreditAccount: vi.fn(),
      listCreditLedger,
    }));

    const { default: app } = await import('../../api/index');
    const response = await app.fetch(createRequest('/api/credits/ledger?limit=0'), createEnv());

    expect(response.status).toBe(200);
    expect(listCreditLedger).toHaveBeenCalledWith(expect.anything(), 'user-1', 20);
  });

  it('falls back to default limit for negative values', async () => {
    const listCreditLedger = vi.fn().mockResolvedValue([]);
    vi.doMock('../lib/auth.js', () => ({
      resolveAuthenticatedUser: vi.fn().mockResolvedValue({
        userId: 'user-1',
        email: 'user@example.com',
        emailVerified: true,
        name: 'User One',
      }),
    }));
    vi.doMock('../lib/credits.js', () => ({
      getCreditAccount: vi.fn(),
      listCreditLedger,
    }));

    const { default: app } = await import('../../api/index');
    const response = await app.fetch(createRequest('/api/credits/ledger?limit=-5'), createEnv());

    expect(response.status).toBe(200);
    expect(listCreditLedger).toHaveBeenCalledWith(expect.anything(), 'user-1', 20);
  });

  it('returns 503 when balance service throws', async () => {
    vi.doMock('../lib/auth.js', () => ({
      resolveAuthenticatedUser: vi.fn().mockResolvedValue({
        userId: 'user-1',
        email: 'user@example.com',
        emailVerified: true,
        name: 'User One',
      }),
    }));
    vi.doMock('../lib/credits.js', () => ({
      getCreditAccount: vi.fn().mockRejectedValue(new Error('DB down')),
      listCreditLedger: vi.fn(),
    }));

    const { default: app } = await import('../../api/index');
    const response = await app.fetch(createRequest('/api/credits/balance'), createEnv());

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: 'Credit service unavailable',
      code: 'SERVICE_UNAVAILABLE',
    });
  });

  it('returns 503 when ledger service throws', async () => {
    vi.doMock('../lib/auth.js', () => ({
      resolveAuthenticatedUser: vi.fn().mockResolvedValue({
        userId: 'user-1',
        email: 'user@example.com',
        emailVerified: true,
        name: 'User One',
      }),
    }));
    vi.doMock('../lib/credits.js', () => ({
      getCreditAccount: vi.fn(),
      listCreditLedger: vi.fn().mockRejectedValue(new Error('DB down')),
    }));

    const { default: app } = await import('../../api/index');
    const response = await app.fetch(createRequest('/api/credits/ledger'), createEnv());

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: 'Credit service unavailable',
      code: 'SERVICE_UNAVAILABLE',
    });
  });
});
