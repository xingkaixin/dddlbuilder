import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestSqlParse } from '@/services/sqlParseService';

describe('requestSqlParse', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('请求成功时应返回解析结果', async () => {
    const parsedResult = {
      tableName: 'users',
      tableComment: '',
      fields: [],
      indexes: [],
      authObjects: [],
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ result: parsedResult }),
    } as unknown as Response);

    const result = await requestSqlParse({
      sql: 'CREATE TABLE users(id INT);',
      dbType: 'mysql',
    });

    expect(result).toEqual(parsedResult);
    expect(fetchSpy).toHaveBeenCalledWith('/api/parse-sql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sql: 'CREATE TABLE users(id INT);',
        dbType: 'mysql',
      }),
    });
  });

  it('响应非 2xx 时应抛出业务错误', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      json: vi.fn().mockResolvedValue({ error: 'SQL 语法错误' }),
    } as unknown as Response);

    await expect(
      requestSqlParse({ sql: 'invalid', dbType: 'mysql' }),
    ).rejects.toThrow('SQL 语法错误');
  });

  it('响应结构不包含 result 时应抛出格式错误', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ foo: 'bar' }),
    } as unknown as Response);

    await expect(
      requestSqlParse({ sql: 'CREATE TABLE t(id INT);', dbType: 'mysql' }),
    ).rejects.toThrow('解析结果格式无效');
  });
});
