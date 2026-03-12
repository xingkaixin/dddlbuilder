import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import app from '../../api/index';
describe('api security guards', () => {
  it('应对超大请求体返回 413', async () => {
    const response = await app.request('/api/parse-sql', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sql: 'SELECT 1',
        dbType: 'mysql',
        padding: 'x'.repeat(140_000),
      }),
    });

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
    const response = await app.request('/api/parse-sql', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sql: 'a'.repeat(50_001),
        dbType: 'mysql',
      }),
    });

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json).toMatchObject({
      error: expect.stringContaining('SQL too long'),
      code: 'SQL_TOO_LONG',
    });
  });

  it('应拒绝非白名单 Origin 的 CORS', async () => {
    const response = await app.request('/api/health', {
      headers: {
        origin: 'https://evil.example.com',
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('应允许白名单 Origin 的 CORS', async () => {
    const origin = 'http://localhost:5173';
    const response = await app.request('/api/health', {
      headers: {
        origin,
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe(origin);
  });

  describe('requestId generation and normalization', () => {
    it('should use provided valid x-request-id', async () => {
      const response = await app.request('/api/health', {
        headers: {
          'x-request-id': 'custom-req-123',
        },
      });
      expect(response.headers.get('x-request-id')).toBe('custom-req-123');
    });

    it('should generate new UUID if provided x-request-id is invalid', async () => {
      const response = await app.request('/api/health', {
        headers: {
          'x-request-id': 'invalid * () id',
        },
      });
      const returnedId = response.headers.get('x-request-id');
      expect(returnedId).not.toBe('invalid * () id');
      expect(returnedId).toEqual(expect.any(String));
      expect(returnedId?.length).toBeGreaterThan(10);
    });

    it('should generate new UUID if x-request-id is entirely whitespace', async () => {
      const response = await app.request('/api/health', {
        headers: {
          'x-request-id': '   ',
        },
      });
      expect(response.headers.get('x-request-id')).not.toBe('   ');
      expect(response.headers.get('x-request-id')).toBeTruthy();
    });
  });

  describe('dynamic CORS origin parsing', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      vi.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should parse custom comma-separated CORS origins', async () => {
      process.env.CORS_ALLOWED_ORIGINS =
        'https://custom1.com, https://custom2.com ';
      const { default: dynamicApp } = await import('../../api/index');

      const res1 = await dynamicApp.request('/api/health', {
        headers: { origin: 'https://custom1.com' },
      });
      expect(res1.headers.get('access-control-allow-origin')).toBe(
        'https://custom1.com',
      );

      const res2 = await dynamicApp.request('/api/health', {
        headers: { origin: 'https://custom2.com' },
      });
      expect(res2.headers.get('access-control-allow-origin')).toBe(
        'https://custom2.com',
      );

      // Default shouldn't be allowed now unless it's in the list
      const res3 = await dynamicApp.request('/api/health', {
        headers: { origin: 'http://localhost:5173' },
      });
      expect(res3.headers.get('access-control-allow-origin')).toBeNull();
    });

    it('should fallback to default origins if custom env is empty or whitespace', async () => {
      process.env.CORS_ALLOWED_ORIGINS = '   ,,,  ';
      const { default: dynamicApp } = await import('../../api/index');

      const res1 = await dynamicApp.request('/api/health', {
        headers: { origin: 'http://localhost:5173' },
      });
      expect(res1.headers.get('access-control-allow-origin')).toBe(
        'http://localhost:5173',
      );
    });
  });
});
