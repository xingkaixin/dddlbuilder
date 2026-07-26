import { afterEach, describe, expect, it, vi } from 'vitest';
import app from '../../api/index';
import type { ApiEnv } from '../lib/context.js';

const createEnv = (overrides: Partial<ApiEnv['Bindings']> = {}): ApiEnv['Bindings'] => ({
  ASSETS: { fetch: globalThis.fetch },
  SHARE_KV: {} as KVNamespace,
  USER_DB: {} as D1Database,
  ...overrides,
});

const createRequest = (path: string, options: RequestInit = {}) =>
  new Request(`http://localhost${path}`, options);

describe('parse-multi-sql route', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('SQL 为空时应返回 SQL_REQUIRED', async () => {
    const env = createEnv();
    const response = await app.fetch(
      createRequest('/api/parse-multi-sql', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sql: '   ', dbType: 'mysql' }),
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
      createRequest('/api/parse-multi-sql', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sql: 'SELECT 1', dbType: 'invalid-db' }),
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

  it('合法多表 SQL 应返回 results 和 failed', async () => {
    const env = createEnv();
    const response = await app.fetch(
      createRequest('/api/parse-multi-sql', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sql: `
            CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(50));
            CREATE TABLE orders (id INT PRIMARY KEY, user_id INT);
          `,
          dbType: 'mysql',
        }),
      }),
      env,
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tableName: 'users' }),
        expect.objectContaining({ tableName: 'orders' }),
      ]),
    );
    expect(payload.failed).toEqual(expect.any(Array));
    expect(payload.results).toHaveLength(2);
  });

  it('SQL 语法错误时应返回 SQL_PARSE_FAILED', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const env = createEnv();
    const response = await app.fetch(
      createRequest('/api/parse-multi-sql', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sql: '%%% not sql %%%', dbType: 'mysql' }),
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
