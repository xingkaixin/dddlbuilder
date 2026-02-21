import { afterEach, describe, expect, it, vi } from 'vitest';
import app from '../index';

describe('parse-sql route', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sql 为空时应返回 SQL_REQUIRED', async () => {
    const response = await app.request('/api/parse-sql', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sql: '   ',
        dbType: 'mysql',
      }),
    });

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload).toMatchObject({
      error: 'SQL is required',
      code: 'SQL_REQUIRED',
      requestId: expect.any(String),
    });
  });

  it('dbType 非法时应返回 INVALID_DATABASE_TYPE', async () => {
    const response = await app.request('/api/parse-sql', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sql: 'SELECT 1',
        dbType: 'invalid-db',
      }),
    });

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload).toMatchObject({
      error: 'Invalid database type',
      code: 'INVALID_DATABASE_TYPE',
      requestId: expect.any(String),
    });
  });

  it('SQL 语法错误时应返回 SQL_PARSE_FAILED', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await app.request('/api/parse-sql', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sql: '%%% not sql %%%',
        dbType: 'mysql',
      }),
    });

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload).toMatchObject({
      error: 'SQL parse failed',
      code: 'SQL_PARSE_FAILED',
      requestId: expect.any(String),
    });
  });
});
