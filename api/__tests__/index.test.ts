import { describe, it, expect } from 'vitest';
import app from '../index';

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
    const json = await response.json();
    expect(json).toMatchObject({
      error: expect.stringContaining('Payload too large'),
      code: 'PAYLOAD_TOO_LARGE',
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
});
