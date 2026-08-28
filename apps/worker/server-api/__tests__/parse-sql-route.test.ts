import { afterEach, describe, expect, it, vi } from 'vitest';
import app from '../../api/index';
import type { ApiEnv } from '../lib/context.js';

vi.mock('../lib/requestRateLimit', () => ({
  enforceIpRateLimit: vi.fn().mockResolvedValue(null),
}));

// Helper to create env object for tests
const createEnv = (overrides: Partial<ApiEnv['Bindings']> = {}): ApiEnv['Bindings'] => ({
  ASSETS: { fetch: globalThis.fetch },
  SHARE_KV: {} as KVNamespace,
  USER_DB: {} as D1Database,
  ...overrides,
});

// Helper to create a request
const createRequest = (path: string, options: RequestInit = {}) =>
  new Request(`http://localhost${path}`, options);

describe('parse-sql route', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sql 为空时应返回 SQL_REQUIRED', async () => {
    const env = createEnv();
    const response = await app.fetch(
      createRequest('/api/parse-sql', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sql: '   ',
          dbType: 'mysql',
        }),
      }),
      env,
    );

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload).toMatchObject({
      error: 'SQL is required',
      code: 'SQL_REQUIRED',
      requestId: expect.any(String),
    });
  });

  it('dbType 非法时应返回 INVALID_DATABASE_TYPE', async () => {
    const env = createEnv();
    const response = await app.fetch(
      createRequest('/api/parse-sql', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sql: 'SELECT 1',
          dbType: 'invalid-db',
        }),
      }),
      env,
    );

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload).toMatchObject({
      error: 'Invalid database type',
      code: 'INVALID_DATABASE_TYPE',
      requestId: expect.any(String),
    });
  });

  it('不把仅支持 DDL 生成的 Hive 交给 SQL 解析器', async () => {
    const response = await app.fetch(
      createRequest('/api/parse-sql', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sql: 'CREATE TABLE users (id BIGINT)', dbType: 'hive' }),
      }),
      createEnv(),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: 'INVALID_DATABASE_TYPE' });
  });

  it('SQL 语法错误时应返回 SQL_PARSE_FAILED', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const env = createEnv();
    const response = await app.fetch(
      createRequest('/api/parse-sql', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sql: '%%% not sql %%%',
          dbType: 'mysql',
        }),
      }),
      env,
    );

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload).toMatchObject({
      error: 'SQL parse failed',
      code: 'SQL_PARSE_FAILED',
      requestId: expect.any(String),
    });
  });
});
