/// <reference types="@cloudflare/workers-types" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { registerShareRoutes } from '../routes/share';
import type { ApiEnv, WorkerRequestLogger } from '../lib/context';
import type { ApiErrorPayload } from '@ddlbuilder/shared-types/api';

// oxlint-disable-next-line anti-slop/no-module-mocking -- Keep rate limiting outside this share route contract test.
vi.mock('../lib/requestRateLimit', () => ({
  enforceIpRateLimit: vi.fn().mockResolvedValue(null),
}));

const VALID_SHARE_ID = '8c6afce1-2a39-47aa-a14f-f3450c3ad7dd';

const buildState = () => ({
  tableName: 'users',
  tableComment: '用户表',
  dbType: 'mysql',
  rows: [],
  addCount: 10,
  indexes: [],
  authInput: '',
  authObjects: [],
});

// Mock KVNamespace 类型
type MockKV = {
  get: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

type ShareResponsePayload = Partial<ApiErrorPayload> & {
  id?: string;
  url?: string;
  expiresInSeconds?: number;
  state?: ReturnType<typeof buildState>;
};

const createMockKV = (): MockKV => {
  const store = new Map<string, string>();

  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string, _opts?: { expirationTtl?: number }) => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
  };
};

const isRecord = (value: unknown): value is ShareResponsePayload =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readPayload = async (response: Response): Promise<ShareResponsePayload> => {
  const payload = await response.json();

  if (!isRecord(payload)) throw new Error('Expected object response payload');

  return payload;
};

describe('share api', () => {
  let app: Hono<ApiEnv>;
  let mockKV: MockKV;
  let requestLogError: ReturnType<typeof vi.fn>;

  afterEach(() => vi.restoreAllMocks());

  beforeEach(() => {
    mockKV = createMockKV();
    requestLogError = vi.fn();

    // SAFETY: The share route only calls these logger methods during this test; the spy object implements that consumed surface.
    // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- the logger double implements only the methods used by this route.
    const requestLogger = {
      set: vi.fn(),
      audit: vi.fn(),
      error: requestLogError,
      warn: vi.fn(),
      setLevel: vi.fn(),
    } as unknown as WorkerRequestLogger;
    app = new Hono<ApiEnv>().basePath('/api');
    app.use('*', async (c, next) => {
      // SAFETY: The route only reads SHARE_KV, USER_DB, and ASSETS from this deliberately minimal test environment.
      c.env = {
        ASSETS: { fetch: globalThis.fetch },
        // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- the KV double implements the route's get/put/delete surface.
        SHARE_KV: mockKV as unknown as KVNamespace,
        USER_DB: {} as D1Database,
      };
      c.set('log', requestLogger);
      await next();
    });
    registerShareRoutes(app);
  });

  it('应创建分享并返回 share url', async () => {
    const response = await app.request('https://ddlbuilder.test/api/share', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        state: buildState(),
      }),
    });

    expect(response.status).toBe(200);

    const payload = await readPayload(response);
    expect(payload).toMatchObject({
      id: expect.any(String),
      expiresInSeconds: 604800,
    });
    expect(payload.url).toBe(`https://ddlbuilder.test/share/${String(payload.id)}`);
    expect(mockKV.put).toHaveBeenCalledTimes(1);
    expect(mockKV.put.mock.calls[0][0]).toMatch(/^share:/);
    expect(mockKV.put.mock.calls[0][2]).toEqual({ expirationTtl: 604800 });
  });

  it('应读取分享内容', async () => {
    const state = buildState();
    mockKV.get.mockResolvedValueOnce(JSON.stringify(state));

    const response = await app.request(`https://ddlbuilder.test/api/share/${VALID_SHARE_ID}`, {
      method: 'GET',
    });

    expect(response.status).toBe(200);

    const payload = await readPayload(response);
    expect(payload).toMatchObject({
      id: VALID_SHARE_ID,
      state,
    });
    expect(mockKV.get).toHaveBeenCalledTimes(1);
    expect(mockKV.get).toHaveBeenCalledWith(`share:${VALID_SHARE_ID}`);
  });

  it('读取分享时 KV 故障应返回可重试的 502，而不是链接不存在', async () => {
    const storageError = new Error('KV error');
    mockKV.get.mockRejectedValueOnce(storageError);

    const response = await app.request(`https://ddlbuilder.test/api/share/${VALID_SHARE_ID}`);
    const payload = await readPayload(response);
    expect(response.status).toBe(502);
    expect(payload.code).toBe('SHARE_LOAD_FAILED');
    expect(JSON.stringify(payload)).not.toContain('KV error');
    expect(requestLogError).toHaveBeenCalledWith(storageError, {
      outcome: { errorCode: 'SHARE_LOAD_FAILED' },
    });
  });
});
