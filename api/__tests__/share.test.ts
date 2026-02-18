import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../index';

const REDIS_URL = 'https://example.upstash.io';
const WRITE_TOKEN = 'write-token';
const READ_TOKEN = 'read-token';
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

describe('share api', () => {
  beforeEach(() => {
    process.env.redis_KV_REST_API_URL = REDIS_URL;
    process.env.redis_KV_REST_API_TOKEN = WRITE_TOKEN;
    process.env.redis_KV_REST_API_READ_ONLY_TOKEN = READ_TOKEN;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.redis_KV_REST_API_URL;
    delete process.env.redis_KV_REST_API_TOKEN;
    delete process.env.redis_KV_REST_API_READ_ONLY_TOKEN;
  });

  it('应创建分享并返回 share url', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ result: 'OK' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

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
    const payload = await response.json();
    expect(payload).toMatchObject({
      id: expect.any(String),
      expiresInSeconds: 604800,
    });
    expect(payload.url).toBe(`https://ddlbuilder.test/share/${payload.id}`);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain(`${REDIS_URL}/set/share%3A`);
    expect(String(url)).toContain('?EX=604800');
    expect((init as RequestInit)?.headers).toMatchObject({
      Authorization: `Bearer ${WRITE_TOKEN}`,
    });
  });

  it('应读取分享内容', async () => {
    const state = buildState();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ result: JSON.stringify(state) }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const response = await app.request(
      `https://ddlbuilder.test/api/share/${VALID_SHARE_ID}`,
      {
        method: 'GET',
      },
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toMatchObject({
      id: VALID_SHARE_ID,
      state,
    });
    expect(payload.meta?.requestId).toEqual(expect.any(String));

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [_, init] = fetchSpy.mock.calls[0];
    expect((init as RequestInit)?.headers).toMatchObject({
      Authorization: `Bearer ${READ_TOKEN}`,
    });
  });

  it('分享不存在时应返回 404', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ result: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const response = await app.request(
      `https://ddlbuilder.test/api/share/${VALID_SHARE_ID}`,
    );

    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload).toMatchObject({
      code: 'SHARE_NOT_FOUND',
    });
  });

  it('请求体无效时应返回 400', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

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
    const payload = await response.json();
    expect(payload).toMatchObject({
      code: 'SHARE_STATE_INVALID',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('缺少 redis 配置时应返回 500', async () => {
    delete process.env.redis_KV_REST_API_URL;

    const response = await app.request('https://ddlbuilder.test/api/share', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        state: buildState(),
      }),
    });

    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload).toMatchObject({
      code: 'REDIS_CONFIG_MISSING',
    });
  });
});
