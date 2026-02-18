import type { Hono } from 'hono';
import type { PersistedState } from '../../src/types';
import {
  errorResponse,
  parseJsonBodyWithLimit,
  withMeta,
} from '../lib/http.js';

const SHARE_TTL_SECONDS = 7 * 24 * 60 * 60;
const SHARE_BODY_MAX_BYTES = 512 * 1024;
const SHARE_KEY_PREFIX = 'share:';
const SHARE_UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface RedisCommandResponse {
  result?: unknown;
  error?: string;
}

type ShareCreateBody = {
  state?: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isValidPersistedState = (value: unknown): value is PersistedState => {
  if (!isRecord(value)) return false;

  const rows = value.rows;
  const indexes = value.indexes;

  return (
    typeof value.tableName === 'string' &&
    typeof value.tableComment === 'string' &&
    typeof value.dbType === 'string' &&
    Array.isArray(rows) &&
    Array.isArray(indexes) &&
    typeof value.addCount === 'number' &&
    typeof value.indexInput === 'string' &&
    Array.isArray(value.currentIndexFields) &&
    typeof value.authInput === 'string' &&
    Array.isArray(value.authObjects)
  );
};

const isValidShareUuid = (value: string) => SHARE_UUID_REGEX.test(value);

const ensureRedisConfig = () => {
  const restUrlRaw = process.env.redis_KV_REST_API_URL?.trim();
  const writeToken = process.env.redis_KV_REST_API_TOKEN?.trim();
  const readToken =
    process.env.redis_KV_REST_API_READ_ONLY_TOKEN?.trim() || writeToken;

  if (!restUrlRaw || !writeToken || !readToken) {
    return null;
  }

  return {
    restUrl: restUrlRaw.replace(/\/+$/, ''),
    writeToken,
    readToken,
  };
};

const decodeRedisResponse = async (
  response: Response,
): Promise<RedisCommandResponse> => {
  const payload = (await response
    .json()
    .catch(() => ({}))) as RedisCommandResponse;
  return payload;
};

async function setShareState(
  redisUrl: string,
  token: string,
  key: string,
  state: PersistedState,
): Promise<boolean> {
  const response = await fetch(
    `${redisUrl}/set/${encodeURIComponent(key)}?EX=${SHARE_TTL_SECONDS}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(state),
    },
  );

  const payload = await decodeRedisResponse(response);
  if (!response.ok || payload.error) {
    return false;
  }

  return true;
}

async function getShareState(
  redisUrl: string,
  token: string,
  key: string,
): Promise<PersistedState | null> {
  const response = await fetch(`${redisUrl}/get/${encodeURIComponent(key)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const payload = await decodeRedisResponse(response);
  if (!response.ok || payload.error) {
    throw new Error('REDIS_GET_FAILED');
  }

  try {
    if (typeof payload.result === 'string') {
      const parsed = JSON.parse(payload.result);
      if (!isValidPersistedState(parsed)) {
        return null;
      }
      return parsed;
    }

    if (isValidPersistedState(payload.result)) {
      return payload.result;
    }

    return null;
  } catch {
    return null;
  }
}

export function registerShareRoutes(app: Hono) {
  app.post('/share', async (c) => {
    const redisConfig = ensureRedisConfig();
    if (!redisConfig) {
      return errorResponse(
        c,
        500,
        'Redis config missing',
        'REDIS_CONFIG_MISSING',
      );
    }

    const parsed = await parseJsonBodyWithLimit<ShareCreateBody>(
      c,
      SHARE_BODY_MAX_BYTES,
    );
    if (parsed.errorResponse) return parsed.errorResponse;

    const body = parsed.data || {};
    const state = body.state;

    if (state == null) {
      return errorResponse(c, 400, 'State is required', 'SHARE_STATE_REQUIRED');
    }

    if (!isValidPersistedState(state)) {
      return errorResponse(c, 400, 'Invalid state', 'SHARE_STATE_INVALID');
    }

    const shareId = crypto.randomUUID();
    const key = `${SHARE_KEY_PREFIX}${shareId}`;

    const ok = await setShareState(
      redisConfig.restUrl,
      redisConfig.writeToken,
      key,
      state,
    );

    if (!ok) {
      return errorResponse(c, 502, 'Share store failed', 'SHARE_STORE_FAILED');
    }

    const origin = new URL(c.req.url).origin;
    return c.json(
      withMeta(c, {
        id: shareId,
        url: `${origin}/share/${shareId}`,
        expiresInSeconds: SHARE_TTL_SECONDS,
      }),
    );
  });

  app.get('/share/:uuid', async (c) => {
    const redisConfig = ensureRedisConfig();
    if (!redisConfig) {
      return errorResponse(
        c,
        500,
        'Redis config missing',
        'REDIS_CONFIG_MISSING',
      );
    }

    const shareId = c.req.param('uuid');
    if (!isValidShareUuid(shareId)) {
      return errorResponse(c, 400, 'Invalid share id', 'SHARE_UUID_INVALID');
    }

    const key = `${SHARE_KEY_PREFIX}${shareId}`;

    let state: PersistedState | null = null;
    try {
      state = await getShareState(
        redisConfig.restUrl,
        redisConfig.readToken,
        key,
      );
    } catch {
      return errorResponse(c, 502, 'Share load failed', 'SHARE_LOAD_FAILED');
    }

    if (!state) {
      return errorResponse(c, 404, 'Share not found', 'SHARE_NOT_FOUND');
    }

    return c.json(withMeta(c, { state, id: shareId }));
  });
}
