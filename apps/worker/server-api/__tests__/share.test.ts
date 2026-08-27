/// <reference types="@cloudflare/workers-types" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { registerShareRoutes } from '../routes/share';
import type { ApiEnv } from '../lib/context';

vi.mock('../lib/requestRateLimit', () => ({
  enforceRequestRateLimit: vi.fn().mockResolvedValue({
    allowed: true,
    limit: 10,
    remaining: 9,
    retryAfterSeconds: 3600,
  }),
}));

const VALID_SHARE_ID = '8c6afce1-2a39-47aa-a14f-f3450c3ad7dd';

const buildState = () => ({
  tableName: 'users',
  tableComment: '用户表',
  dbType: 'mysql',
  rows: [],
  addCount: 10,
  indexInput: '',
  currentIndexFields: [],
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

describe('share api', () => {
  let app: Hono<ApiEnv>;
  let mockKV: MockKV;

  afterEach(() => vi.restoreAllMocks());

  beforeEach(() => {
    mockKV = createMockKV();
    app = new Hono<ApiEnv>().basePath('/api');
    app.use('*', async (c, next) => {
      c.env = {
        SHARE_KV: mockKV as unknown as KVNamespace,
      };
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
    const payload = (await response.json()) as {
      id: string;
      expiresInSeconds: number;
      url: string;
    };
    expect(payload).toMatchObject({
      id: expect.any(String),
      expiresInSeconds: 604800,
    });
    expect(payload.url).toBe(`https://ddlbuilder.test/share/${payload.id}`);
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
    const payload = (await response.json()) as {
      id: string;
      state: typeof state;
      meta?: { requestId?: string };
    };
    expect(payload).toMatchObject({
      id: VALID_SHARE_ID,
      state,
    });
    expect(mockKV.get).toHaveBeenCalledTimes(1);
    expect(mockKV.get).toHaveBeenCalledWith(`share:${VALID_SHARE_ID}`);
  });

  it('分享不存在时应返回 404', async () => {
    mockKV.get.mockResolvedValueOnce(null);

    const response = await app.request(`https://ddlbuilder.test/api/share/${VALID_SHARE_ID}`);

    expect(response.status).toBe(404);
    const payload = (await response.json()) as { code: string };
    expect(payload).toMatchObject({
      code: 'SHARE_NOT_FOUND',
    });
  });

  it('请求体无效时应返回 400', async () => {
    const response = await app.request('https://ddlbuilder.test/api/share', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        state: { tableName: 'users' },
      }),
    });

    expect(response.status).toBe(400);
    const payload = (await response.json()) as { code: string };
    expect(payload).toMatchObject({
      code: 'SHARE_STATE_INVALID',
    });
    expect(mockKV.put).not.toHaveBeenCalled();
  });

  it('未知数据库类型应返回 400', async () => {
    const response = await app.request('https://ddlbuilder.test/api/share', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state: { ...buildState(), dbType: 'unknown' } }),
    });

    expect(response.status).toBe(400);
    expect(mockKV.put).not.toHaveBeenCalled();
  });

  it('缺少 KV 配置时应返回 500', async () => {
    // 创建没有 KV 绑定的 app
    const appNoKV = new Hono<ApiEnv>().basePath('/api');
    appNoKV.use('*', async (c, next) => {
      // @ts-expect-error - 故意不提供完整环境
      c.env = {};
      await next();
    });
    registerShareRoutes(appNoKV);

    const response = await appNoKV.request('https://ddlbuilder.test/api/share', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        state: buildState(),
      }),
    });

    expect(response.status).toBe(500);
    const payload = (await response.json()) as { code: string };
    expect(payload).toMatchObject({
      code: 'KV_CONFIG_MISSING',
    });
  });

  it('分享体没有 state 时应返回 400', async () => {
    const response = await app.request('https://ddlbuilder.test/api/share', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        somethingElse: 'hello',
      }),
    });
    expect(response.status).toBe(400);
    const payload = (await response.json()) as { code: string };
    expect(payload.code).toBe('SHARE_STATE_REQUIRED');
  });

  it('如果保存到 KV 失败应当返回 502', async () => {
    mockKV.put.mockRejectedValueOnce(new Error('KV error'));

    const response = await app.request('https://ddlbuilder.test/api/share', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ state: buildState() }),
    });
    expect(response.status).toBe(502);
    const payload = (await response.json()) as { code: string };
    expect(payload.code).toBe('SHARE_STORE_FAILED');
  });

  it('读取分享时共享 ID 格式不对应当返回 400', async () => {
    const response = await app.request(`https://ddlbuilder.test/api/share/invalid-id`);
    expect(response.status).toBe(400);
    const payload = (await response.json()) as { code: string };
    expect(payload.code).toBe('SHARE_UUID_INVALID');
  });

  it('读取分享时 KV 故障应返回可重试的 502，而不是链接不存在', async () => {
    const storageError = new Error('KV error');
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockKV.get.mockRejectedValueOnce(storageError);

    const response = await app.request(`https://ddlbuilder.test/api/share/${VALID_SHARE_ID}`);
    const payload = (await response.json()) as { code: string };
    console.info('Share storage failure response', { status: response.status, payload });
    expect(response.status).toBe(502);
    expect(payload.code).toBe('SHARE_LOAD_FAILED');
    expect(JSON.stringify(payload)).not.toContain('KV error');
    expect(errorLog).toHaveBeenCalledWith('[share] storage read failed', storageError);
  });

  it('GET缺少 KV 配置时应返回 500', async () => {
    // 创建没有 KV 绑定的 app
    const appNoKV = new Hono<ApiEnv>().basePath('/api');
    appNoKV.use('*', async (c, next) => {
      // @ts-expect-error - 故意不提供完整环境
      c.env = {};
      await next();
    });
    registerShareRoutes(appNoKV);

    const response = await appNoKV.request(`https://ddlbuilder.test/api/share/${VALID_SHARE_ID}`);
    expect(response.status).toBe(500);
    const payload = (await response.json()) as { code: string };
    expect(payload.code).toBe('KV_CONFIG_MISSING');
  });

  it('KV返回的JSON无法解析为有效State时应当返回 404', async () => {
    mockKV.get.mockResolvedValueOnce('{"invalid": true}');

    const response = await app.request(`https://ddlbuilder.test/api/share/${VALID_SHARE_ID}`);
    expect(response.status).toBe(404);
    const payload = (await response.json()) as { code: string };
    expect(payload.code).toBe('SHARE_NOT_FOUND');
  });

  it('KV返回无效JSON字符串时应当返回 404', async () => {
    mockKV.get.mockResolvedValueOnce('{invalid_json...');

    const response = await app.request(`https://ddlbuilder.test/api/share/${VALID_SHARE_ID}`);
    expect(response.status).toBe(404);
    const payload = (await response.json()) as { code: string };
    expect(payload.code).toBe('SHARE_NOT_FOUND');
  });
});
