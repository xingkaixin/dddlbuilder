import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestMultiSqlParse, requestSqlParse } from '@/services/sqlParseService';
import { ApiError } from '@/services/apiError';

describe('requestSqlParse', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([requestSqlParse, requestMultiSqlParse])(
    '%s 应保留业务错误的安全标识与文案',
    async (parse) => {
      const message = '暂不支持导入 生成列，无法完整保留该定义。';
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        Response.json({ error: message, code: 'SQL_PARSE_FAILED' }, { status: 400 }),
      );

      const request = parse({ sql: 'invalid', dbType: 'mysql' });

      await expect(request).rejects.toBeInstanceOf(ApiError);
      await expect(request).rejects.toMatchObject({
        message,
        status: 400,
        code: 'SQL_PARSE_FAILED',
      });
    },
  );
});
