import { afterEach, describe, expect, it, vi } from 'vitest';
import { SqlParseError, SqlParser } from '@ddlbuilder/ddl-core/parser';
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
      error: '无法解析 SQL，请检查语法或数据库类型是否正确。',
      code: 'SQL_PARSE_FAILED',
      requestId: expect.any(String),
    });
  });

  it('不支持的定义应返回安全原因且不泄露解析器诊断', async () => {
    vi.spyOn(SqlParser.prototype, 'parseAsync').mockRejectedValueOnce(
      new SqlParseError('暂不支持导入 生成列，无法完整保留该定义。', 'internal parser diagnostic'),
    );

    const response = await app.fetch(
      createRequest('/api/parse-sql', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sql: 'CREATE TABLE users (id INT)', dbType: 'mysql' }),
      }),
      createEnv(),
    );

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload).toMatchObject({
      error: '暂不支持导入 生成列，无法完整保留该定义。',
      code: 'SQL_PARSE_FAILED',
      requestId: expect.any(String),
    });
    expect(JSON.stringify(payload)).not.toContain('internal parser diagnostic');
  });

  it('解析器内部异常时应返回 INTERNAL_ERROR', async () => {
    vi.spyOn(SqlParser.prototype, 'parseAsync').mockRejectedValueOnce(
      new Error('unexpected parser failure'),
    );

    const response = await app.fetch(
      createRequest('/api/parse-sql', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sql: 'CREATE TABLE users (id INT)', dbType: 'mysql' }),
      }),
      createEnv(),
    );

    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload).toMatchObject({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    });
    expect(JSON.stringify(payload)).not.toContain('unexpected parser failure');
  });
});
