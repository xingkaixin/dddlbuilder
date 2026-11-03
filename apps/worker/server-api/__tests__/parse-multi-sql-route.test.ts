import { afterEach, describe, expect, it, vi } from 'vitest';
import { SqlParser, type MultiParsedResult } from '@ddlbuilder/ddl-core/parser';
import app from '../../api/index';
import type { ApiEnv } from '../lib/context.js';

// oxlint-disable-next-line anti-slop/no-module-mocking -- route tests isolate rate-limit policy to exercise SQL parsing.
vi.mock('../lib/requestRateLimit', () => ({
  enforceIpRateLimit: vi.fn().mockResolvedValue(null),
}));

const createEnv = (overrides: Partial<ApiEnv['Bindings']> = {}): ApiEnv['Bindings'] => ({
  ASSETS: { fetch: globalThis.fetch },
  // SAFETY: parse route tests do not access KV.
  SHARE_KV: {} as KVNamespace,
  // SAFETY: parse route tests do not access D1.
  USER_DB: {} as D1Database,
  ...overrides,
});

const createRequest = (path: string, options: RequestInit = {}) =>
  new Request(`http://localhost${path}`, options);

describe('parse-multi-sql route', () => {
  afterEach(() => {
    vi.restoreAllMocks();
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
    const payload = await response.json<MultiParsedResult>();
    expect(payload.results).toEqual([expect.objectContaining({ tableName: 'users' })]);
    expect(payload.failed).toEqual([
      expect.objectContaining({
        statement: expect.stringContaining('CREATE TABLE broken'),
        error: expect.any(String),
      }),
    ]);
  });

  it('全部定义解析失败时应展示首个具体失败原因并保留失败列表', async () => {
    const failed = [
      {
        statement: 'CREATE TABLE totals (total INT GENERATED ALWAYS AS (1) STORED)',
        error: '暂不支持导入 生成列，无法完整保留该定义。',
      },
      {
        statement: 'CREATE TABLE broken (id INT, missing)',
        error: '无法解析 SQL，请检查语法或数据库类型是否正确。',
      },
    ];
    vi.spyOn(SqlParser.prototype, 'parseMultiAsync').mockResolvedValueOnce({
      results: [],
      failed,
    });

    const response = await app.fetch(
      createRequest('/api/parse-multi-sql', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sql: failed.map(({ statement }) => statement).join(';'),
          dbType: 'mysql',
        }),
      }),
      createEnv(),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      results: [],
      failed,
      error: '暂不支持导入 生成列，无法完整保留该定义。',
      code: 'SQL_PARSE_FAILED',
      requestId: expect.any(String),
    });
  });
});
