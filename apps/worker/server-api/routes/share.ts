import type { Hono } from 'hono';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { decodePersistedState } from '@ddlbuilder/workspace-core';
import type { ApiEnv } from '../lib/context.js';
import { errorResponse, parseJsonBodyWithLimit, withMeta } from '../lib/http.js';
import { enforceIpRateLimit } from '../lib/requestRateLimit.js';

const SHARE_TTL_SECONDS = 7 * 24 * 60 * 60;
const SHARE_BODY_MAX_BYTES = 512 * 1024;
const SHARE_KEY_PREFIX = 'share:';
const SHARE_UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHARE_CREATE_RATE_LIMIT = {
  scope: 'share:create',
  limit: 10,
  windowMs: 60 * 60 * 1000,
} as const;

type ShareCreateBody = { state?: unknown };

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
  const value = await kv.get(key);
  if (!value) return null;

  try {
    return decodePersistedState(JSON.parse(value), 'external');
  } catch {
    return null;
  }
}

export function registerShareRoutes(app: Hono<ApiEnv>) {
  app.post('/share', async (c) => {
    const limited = await enforceIpRateLimit(c, SHARE_CREATE_RATE_LIMIT, 'Too many share requests');
    if (limited) return limited;

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

    const decodedState = decodePersistedState(state, 'external');
    if (!decodedState) {
      return errorResponse(c, 400, 'Invalid state', 'SHARE_STATE_INVALID');
    }

    const shareId = crypto.randomUUID();
    const key = `${SHARE_KEY_PREFIX}${shareId}`;

    const ok = await setShareState(kv, key, decodedState);

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

    let state: PersistedState | null;
    try {
      state = await getShareState(kv, key);
    } catch (error) {
      console.error('[share] storage read failed', error);
      return errorResponse(c, 502, 'Share read failed', 'SHARE_LOAD_FAILED');
    }

    if (!state) {
      return errorResponse(c, 404, 'Share not found', 'SHARE_NOT_FOUND');
    }

    return c.json(withMeta(c, { state, id: shareId }));
  });
}
