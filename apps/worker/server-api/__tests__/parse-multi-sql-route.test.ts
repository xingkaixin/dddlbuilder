import { afterEach, describe, expect, it, vi } from 'vitest';
import { SqlParser } from '@ddlbuilder/ddl-core/parser';
import app from '../../api/index';
import type { ApiEnv } from '../lib/context.js';

vi.mock('../lib/requestRateLimit', () => ({
  enforceIpRateLimit: vi.fn().mockResolvedValue(null),
}));

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

  it('部分 SQL 语法错误时保留成功结果和失败原语句', async () => {
    const response = await app.fetch(
      createRequest('/api/parse-multi-sql', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sql: 'CREATE TABLE users (id INT); CREATE TABLE broken (id INT, missing);',
          dbType: 'mysql',
        }),
      }),
      createEnv(),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.results).toEqual([expect.objectContaining({ tableName: 'users' })]);
    expect(payload.failed).toEqual([
      expect.objectContaining({
        statement: expect.stringContaining('CREATE TABLE broken'),
        error: expect.any(String),
      }),
    ]);
  });

  it('SQL 语法错误时应返回 SQL_PARSE_FAILED', async () => {
    const env = createEnv();
    const response = await app.fetch(
      createRequest('/api/parse-multi-sql', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sql: '%%% not sql %%%', dbType: 'mysql' }),
      }),
      env,
    );

    const payload = await response.json();
    expect(response.status).toBe(400);
    expect(payload).toMatchObject({
      error: 'SQL parse failed',
      code: 'SQL_PARSE_FAILED',
      requestId: expect.any(String),
    });
  });

  it('多语句解析器内部异常时应返回 INTERNAL_ERROR', async () => {
    vi.spyOn(SqlParser.prototype, 'parseMultiAsync').mockRejectedValueOnce(
      new Error('unexpected parser failure'),
    );

    const response = await app.fetch(
      createRequest('/api/parse-multi-sql', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sql: 'CREATE TABLE users (id INT)', dbType: 'mysql' }),
      }),
      createEnv(),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    });
  });
});
