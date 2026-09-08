import * as Schema from 'effect/Schema';
import {
  MAX_SQL_LENGTH,
  SqlParseRequestSchema,
  SqlParseResponseSchema,
  MultiSqlParseResponseSchema,
} from '@ddlbuilder/shared-types/api-contracts';
import type { Hono } from 'hono';
import { SqlParseError, SqlParser } from '@ddlbuilder/ddl-core/parser';
import type { ApiEnv } from '../lib/context.js';
import {
  errorResponse,
  getRequestId,
  parseJsonBodyWithLimit,
  withMeta,
  type JsonBodyResult,
} from '../lib/http.js';
import { enforceIpRateLimit } from '../lib/requestRateLimit.js';

const MAX_PARSE_SQL_BODY_BYTES = 131_072;
const PARSE_SQL_RATE_LIMIT = {
  scope: 'parse:sql',
  limit: 10,
  windowMs: 60 * 1000,
} as const;

function validateSqlPayload(
  parsed: JsonBodyResult<{ sql: unknown; dbType: unknown }>,
  c: Parameters<typeof errorResponse>[0],
) {
  if (!parsed.ok) return { errorResponse: parsed.response };

  const sql = parsed.data?.sql;

  if (typeof sql !== 'string' || sql.trim().length === 0) {
    return { errorResponse: errorResponse(c, 400, 'SQL is required', 'SQL_REQUIRED') };
  }

  if (sql.length > MAX_SQL_LENGTH) {
    return {
      errorResponse: errorResponse(
        c,
        400,
        `SQL too long, maximum ${MAX_SQL_LENGTH} characters`,
        'SQL_TOO_LONG',
      ),
    };
  }

  const decoded = Schema.decodeUnknownOption(SqlParseRequestSchema)(parsed.data);
  if (decoded._tag === 'None') {
    return {
      errorResponse: errorResponse(c, 400, 'Invalid database type', 'INVALID_DATABASE_TYPE'),
    };
  }

  return decoded.value;
}

export function registerParseSqlRoute(app: Hono<ApiEnv>) {
  app.post('/parse-sql', async (c) => {
    const limited = await enforceIpRateLimit(c, PARSE_SQL_RATE_LIMIT, 'Too many parse requests');
    if (limited) return limited;

    const parsed = await parseJsonBodyWithLimit<{
      sql: unknown;
      dbType: unknown;
    }>(c, MAX_PARSE_SQL_BODY_BYTES);

    const validation = validateSqlPayload(parsed, c);
    if ('errorResponse' in validation) return validation.errorResponse;
    const { sql, dbType } = validation;

    try {
      const parser = new SqlParser();
      const result = await parser.parseAsync(sql, dbType);

      return c.json(Schema.decodeUnknownSync(SqlParseResponseSchema)(withMeta(c, { result })));
    } catch (error) {
      if (error instanceof SqlParseError) {
        return errorResponse(c, 400, error.message, 'SQL_PARSE_FAILED');
      }
      throw error;
    }
  });

  app.post('/parse-multi-sql', async (c) => {
    const limited = await enforceIpRateLimit(c, PARSE_SQL_RATE_LIMIT, 'Too many parse requests');
    if (limited) return limited;

    const parsed = await parseJsonBodyWithLimit<{
      sql: unknown;
      dbType: unknown;
    }>(c, MAX_PARSE_SQL_BODY_BYTES);

    const validation = validateSqlPayload(parsed, c);
    if ('errorResponse' in validation) return validation.errorResponse;
    const { sql, dbType } = validation;

    const parser = new SqlParser();
    const response = Schema.decodeUnknownSync(MultiSqlParseResponseSchema)(
      withMeta(c, await parser.parseMultiAsync(sql, dbType)),
    );
    const { results, failed } = response;
    if (results.length === 0 && failed.length > 0) {
      return c.json(
        {
          results,
          failed,
          error: failed[0].error,
          code: 'SQL_PARSE_FAILED',
          requestId: getRequestId(c),
        },
        400,
      );
    }

    return c.json(response);
  });
}
