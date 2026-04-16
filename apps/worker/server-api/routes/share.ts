import type { Hono } from 'hono';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { ApiEnv } from '../lib/context.js';
import { errorResponse, parseJsonBodyWithLimit, withMeta } from '../lib/http.js';

const SHARE_TTL_SECONDS = 7 * 24 * 60 * 60;
const SHARE_BODY_MAX_BYTES = 512 * 1024;
const SHARE_KEY_PREFIX = 'share:';
const SHARE_UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

async function setShareState(
  kv: KVNamespace,
  key: string,
  state: PersistedState,
): Promise<boolean> {
  try {
    await kv.put(key, JSON.stringify(state), {
      expirationTtl: SHARE_TTL_SECONDS,
    });
    return true;
  } catch {
    return false;
  }
}

async function getShareState(kv: KVNamespace, key: string): Promise<PersistedState | null> {
  try {
    const value = await kv.get(key);
    if (!value) return null;

    const parsed = JSON.parse(value);
    if (!isValidPersistedState(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function registerShareRoutes(app: Hono<ApiEnv>) {
  app.post('/share', async (c) => {
    const kv = c.env.SHARE_KV;
    if (!kv) {
      return errorResponse(c, 500, 'KV binding missing', 'KV_CONFIG_MISSING');
    }

    const parsed = await parseJsonBodyWithLimit<ShareCreateBody>(c, SHARE_BODY_MAX_BYTES);
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

    const ok = await setShareState(kv, key, state);

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
    const kv = c.env.SHARE_KV;
    if (!kv) {
      return errorResponse(c, 500, 'KV binding missing', 'KV_CONFIG_MISSING');
    }

    const shareId = c.req.param('uuid');
    if (!isValidShareUuid(shareId)) {
      return errorResponse(c, 400, 'Invalid share id', 'SHARE_UUID_INVALID');
    }

    const key = `${SHARE_KEY_PREFIX}${shareId}`;

    const state = await getShareState(kv, key);

    if (!state) {
      return errorResponse(c, 404, 'Share not found', 'SHARE_NOT_FOUND');
    }

    return c.json(withMeta(c, { state, id: shareId }));
  });
}
