import { describe, it, expect } from 'vitest';
import { vi } from 'vitest';
import app from '../../api/index';
import type { ApiEnv } from '../lib/context.js';

// Helper to create env object for tests
const createEnv = (overrides: Partial<ApiEnv['Bindings']> = {}): ApiEnv['Bindings'] => ({
  ASSETS: { fetch: globalThis.fetch },
  SHARE_KV: {} as KVNamespace,
  RATE_LIMIT_KV: {} as KVNamespace,
  ...overrides,
});

// Helper to create a request with origin header
const createRequest = (path: string, options: RequestInit & { origin?: string } = {}) => {
  const { origin, ...rest } = options;
  const headers = new Headers(rest.headers);
  if (origin) {
    headers.set('origin', origin);
  }
  return new Request(`http://localhost${path}`, {
    ...rest,
    headers,
  });
};

describe('api security guards', () => {
  it('应将 /docs 重定向到 /docs/', async () => {
    const env = createEnv();
    const response = await app.fetch(createRequest('/docs'), env);

    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe('/docs/');
  });

  it('应在 localhost 下代理 /docs/* 到 VitePress 开发服务', async () => {
    const env = createEnv();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<!doctype html><title>docs</title>', {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
    );

    const response = await app.fetch(createRequest('/docs/zh/?from=test'), env);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [request] = fetchSpy.mock.calls[0] as [Request];
    expect(request.url).toBe('http://127.0.0.1:5174/docs/zh/?from=test');
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('<title>docs</title>');

    fetchSpy.mockRestore();
  });

  it('应在非 localhost 下对 /docs/* 回落到静态资源', async () => {
    const assetsFetch = vi.fn().mockResolvedValue(new Response('prod docs', { status: 200 }));
    const env = createEnv({
      ASSETS: { fetch: assetsFetch as typeof fetch },
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const response = await app.fetch(
      new Request('https://ddl.xingkaixin.me/docs/zh/', {
        method: 'GET',
      }),
      env,
    );

    expect(assetsFetch).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await response.text()).toBe('prod docs');

    fetchSpy.mockRestore();
  });

  it('应对超大请求体返回 413', async () => {
    const env = createEnv();
    const response = await app.fetch(
      createRequest('/api/parse-sql', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sql: 'SELECT 1',
          dbType: 'mysql',
          padding: 'x'.repeat(140_000),
        }),
      }),
      env,
    );

    expect(response.status).toBe(413);
    expect(response.headers.get('x-request-id')).toEqual(expect.any(String));
    const json = await response.json();
    expect(json).toMatchObject({
      error: expect.stringContaining('Payload too large'),
      code: 'PAYLOAD_TOO_LARGE',
      requestId: expect.any(String),
    });
  });

  it('应对超长 SQL 返回 400', async () => {
    const env = createEnv();
    const response = await app.fetch(
      createRequest('/api/parse-sql', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sql: 'a'.repeat(50_001),
          dbType: 'mysql',
        }),
      }),
      env,
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json).toMatchObject({
      error: expect.stringContaining('SQL too long'),
      code: 'SQL_TOO_LONG',
    });
  });

  it('应拒绝非白名单 Origin 的 CORS', async () => {
    const env = createEnv();
    const response = await app.fetch(
      createRequest('/api/health', { origin: 'https://evil.example.com' }),
      env,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('应允许白名单 Origin 的 CORS', async () => {
    const origin = 'http://localhost:5173';
    const env = createEnv();
    const response = await app.fetch(createRequest('/api/health', { origin }), env);

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe(origin);
  });

  describe('requestId generation and normalization', () => {
    it('should use provided valid x-request-id', async () => {
      const env = createEnv();
      const response = await app.fetch(
        createRequest('/api/health', {
          headers: {
            'x-request-id': 'custom-req-123',
          },
        }),
        env,
      );
      expect(response.headers.get('x-request-id')).toBe('custom-req-123');
    });

    it('should generate new UUID if provided x-request-id is invalid', async () => {
      const env = createEnv();
      const response = await app.fetch(
        createRequest('/api/health', {
          headers: {
            'x-request-id': 'invalid * () id',
          },
        }),
        env,
      );
      const returnedId = response.headers.get('x-request-id');
      expect(returnedId).not.toBe('invalid * () id');
      expect(returnedId).toEqual(expect.any(String));
      expect(returnedId?.length).toBeGreaterThan(10);
    });

    it('should generate new UUID if x-request-id is entirely whitespace', async () => {
      const env = createEnv();
      const response = await app.fetch(
        createRequest('/api/health', {
          headers: {
            'x-request-id': '   ',
          },
        }),
        env,
      );
      expect(response.headers.get('x-request-id')).not.toBe('   ');
      expect(response.headers.get('x-request-id')).toBeTruthy();
    });
  });

  describe('dynamic CORS origin parsing', () => {
    it('should parse custom comma-separated CORS origins', async () => {
      const env = createEnv({
        CORS_ALLOWED_ORIGINS: 'https://custom1.com, https://custom2.com ',
      });

      const res1 = await app.fetch(
        createRequest('/api/health', { origin: 'https://custom1.com' }),
        env,
      );
      expect(res1.headers.get('access-control-allow-origin')).toBe('https://custom1.com');

      const res2 = await app.fetch(
        createRequest('/api/health', { origin: 'https://custom2.com' }),
        env,
      );
      expect(res2.headers.get('access-control-allow-origin')).toBe('https://custom2.com');

      // Default shouldn't be allowed now unless it's in the list
      const res3 = await app.fetch(
        createRequest('/api/health', { origin: 'http://localhost:5173' }),
        env,
      );
      expect(res3.headers.get('access-control-allow-origin')).toBeNull();
    });

    it('should fallback to default origins if custom env is empty or whitespace', async () => {
      const env = createEnv({
        CORS_ALLOWED_ORIGINS: '   ,,,  ',
      });

      const res1 = await app.fetch(
        createRequest('/api/health', { origin: 'http://localhost:5173' }),
        env,
      );
      expect(res1.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    });
  });
});
