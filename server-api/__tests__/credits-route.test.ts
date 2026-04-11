import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from '../lib/context.js';

const createEnv = (overrides: Partial<ApiEnv['Bindings']> = {}): ApiEnv['Bindings'] => ({
  ASSETS: { fetch: globalThis.fetch },
  SHARE_KV: {} as KVNamespace,
  RATE_LIMIT_KV: {} as KVNamespace,
  USER_DB: {} as D1Database,
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_JWKS_URL: 'https://example.supabase.co/auth/v1/.well-known/jwks.json',
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
      readBearerToken: () => 'token',
      authenticateAccessToken: vi.fn().mockResolvedValue({
        appUserId: 'supabase_user-1',
        externalUserId: 'user-1',
        email: 'user@example.com',
        status: 'active',
      }),
      isInvalidJwtError: () => false,
    }));
    vi.doMock('../lib/credits.js', () => ({
      getCreditAccount: vi.fn().mockResolvedValue({
        userId: 'supabase_user-1',
        balance: 8800,
        version: 3,
        updatedAt: '2026-04-11T00:00:00Z',
      }),
      listCreditLedger: vi.fn(),
    }));

    const { default: app } = await import('../../api/index');
    const response = await app.fetch(
      createRequest('/api/credits/balance', {
        headers: {
          Authorization: 'Bearer token',
        },
      }),
      createEnv(),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      balance: 8800,
      version: 3,
      userId: 'supabase_user-1',
    });
  });

  it('returns recent ledger entries for authenticated users', async () => {
    vi.doMock('../lib/auth.js', () => ({
      readBearerToken: () => 'token',
      authenticateAccessToken: vi.fn().mockResolvedValue({
        appUserId: 'supabase_user-1',
        externalUserId: 'user-1',
        email: 'user@example.com',
        status: 'active',
      }),
      isInvalidJwtError: () => false,
    }));
    vi.doMock('../lib/credits.js', () => ({
      getCreditAccount: vi.fn(),
      listCreditLedger: vi.fn().mockResolvedValue([
        {
          id: 'grant:signup',
          userId: 'supabase_user-1',
          kind: 'grant',
          source: 'signup_bonus',
          amount: 100000,
          balanceAfter: 100000,
          idempotencyKey: 'signup_bonus:supabase_user-1',
          relatedUsageId: null,
          metadataJson: '{"provider":"supabase"}',
          createdAt: '2026-04-11T00:00:00Z',
        },
      ]),
    }));

    const { default: app } = await import('../../api/index');
    const response = await app.fetch(
      createRequest('/api/credits/ledger?limit=10', {
        headers: {
          Authorization: 'Bearer token',
        },
      }),
      createEnv(),
    );

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
});
