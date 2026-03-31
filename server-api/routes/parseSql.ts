import type { Hono } from 'hono';
import type { DatabaseType } from '../../src/types/index.js';
import type { ApiEnv } from '../lib/context.js';
import { errorResponse, parseJsonBodyWithLimit, withMeta } from '../lib/http.js';

const MAX_SQL_LENGTH = 50_000;
const MAX_PARSE_SQL_BODY_BYTES = 131_072;

const SUPPORTED_DATABASE_TYPES = new Set<DatabaseType>([
  'mysql',
  'postgresql',
  'postgresql-citus',
  'sqlserver',
  'oracle',
  'mariadb',
  'tidb',
  'dm',
  'oceanbase',
  'oceanbase-oracle',
  'kingbase',
  'gbase',
  'polardb',
  'gaussdb',
]);

function isValidDatabaseType(value: unknown): value is DatabaseType {
  return typeof value === 'string' && SUPPORTED_DATABASE_TYPES.has(value as DatabaseType);
}

export function registerParseSqlRoute(app: Hono<ApiEnv>) {
  app.post('/parse-sql', async (c) => {
    const parsed = await parseJsonBodyWithLimit<{
      sql: unknown;
      dbType: unknown;
    }>(c, MAX_PARSE_SQL_BODY_BYTES);
    if (parsed.errorResponse) return parsed.errorResponse;

    const sql = parsed.data?.sql;
    const dbType = parsed.data?.dbType;

    if (typeof sql !== 'string' || sql.trim().length === 0) {
      return errorResponse(c, 400, 'SQL is required', 'SQL_REQUIRED');
    }

    if (sql.length > MAX_SQL_LENGTH) {
      return errorResponse(
        c,
        400,
        `SQL too long, maximum ${MAX_SQL_LENGTH} characters`,
        'SQL_TOO_LONG',
      );
    }

    if (!isValidDatabaseType(dbType)) {
      return errorResponse(c, 400, 'Invalid database type', 'INVALID_DATABASE_TYPE');
    }

    try {
      const { SqlParser } = await import('../../src/utils/SqlParser.js');
      const parser = new SqlParser();
      const result = await parser.parseAsync(sql, dbType);

      return c.json(withMeta(c, { result }));
    } catch (error) {
      console.error('[ParseSQL] Failed to parse SQL:', error);
      return errorResponse(c, 400, 'SQL parse failed', 'SQL_PARSE_FAILED');
    }
  });
}
