import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestMultiSqlParse, requestSqlParse } from '@/services/sqlParseService';
import { ApiError } from '@/services/apiError';

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

  it.each([requestSqlParse, requestMultiSqlParse])(
    '%s 应保留业务错误的安全标识与文案',
    async (parse) => {
      const message = '暂不支持导入 生成列，无法完整保留该定义。';
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 400,
        json: vi.fn().mockResolvedValue({ error: message, code: 'SQL_PARSE_FAILED' }),
      } as unknown as Response);

      const request = parse({ sql: 'invalid', dbType: 'mysql' });

      await expect(request).rejects.toBeInstanceOf(ApiError);
      await expect(request).rejects.toMatchObject({
        message,
        status: 400,
        code: 'SQL_PARSE_FAILED',
      });
    },
  );

  it.each([requestSqlParse, requestMultiSqlParse])(
    '%s 应将无有效错误体的 HTTP 失败保留为 ApiError',
    async (parse) => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 500,
        json: vi.fn().mockResolvedValue(null),
      } as unknown as Response);

      const request = parse({ sql: 'invalid', dbType: 'mysql' });

      await expect(request).rejects.toBeInstanceOf(ApiError);
      await expect(request).rejects.toMatchObject({ status: 500, code: undefined });
    },
  );

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
