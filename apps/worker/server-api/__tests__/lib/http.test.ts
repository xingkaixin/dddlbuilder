import { describe, it, expect } from 'vitest';
import type { Context } from 'hono';
import type { ApiErrorPayload } from '@ddlbuilder/shared-types/api';
import type { ApiEnv } from '../../lib/context';
import { getRequestId, withMeta, errorResponse, parseJsonBodyWithLimit } from '../../lib/http';

describe('http lib utilities', () => {
  const mockContext = (
    requestId?: string,
    bodyText?: string,
    headers: Record<string, string> = {},
  ) => {
    // SAFETY: This context double implements get, json, req.raw, and req.header used by the HTTP helpers.
    // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- Hono's full context contains unrelated runtime state.
    return {
      get: (key: string) => {
        if (key === 'requestId') return requestId;

        return undefined;
      },
      json: (data: ApiErrorPayload, status: number) =>
        new Response(JSON.stringify(data), {
          status,
          headers: { 'content-type': 'application/json' },
        }),
      req: {
        raw: new Request('http://localhost/test', {
          method: 'POST',
          headers,
          ...(bodyText === undefined ? {} : { body: bodyText }),
        }),
        header: (name: string) => headers[name],
      },
    } as unknown as Context<ApiEnv>;
  };

  describe('getRequestId', () => {
    it('returns undefined if requestId is empty string or pure whitespace', () => {
      expect(getRequestId(mockContext(''))).toBeUndefined();
      expect(getRequestId(mockContext('   '))).toBeUndefined();
    });

    it('returns trimmed requestId', () => {
      expect(getRequestId(mockContext('  req123  '))).toBe('req123');
    });

    it('returns undefined if not a string', () => {
      // SAFETY: this negative case only exercises getRequestId's handling of a non-string context value.
      // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- the fixture intentionally omits unrelated Context members.
      const c = { get: () => 1234 } as unknown as Context<ApiEnv>;
      expect(getRequestId(c)).toBeUndefined();
    });
  });

  describe('withMeta', () => {
    it('returns unmodified payload if no requestId', () => {
      const c = mockContext('');
      const payload = { foo: 'bar' };
      expect(withMeta(c, payload)).toEqual(payload);
    });

    it('adds meta with requestId', () => {
      const c = mockContext('req-999');
      const payload = { foo: 'bar' };
      expect(withMeta(c, payload)).toEqual({
        foo: 'bar',
        meta: { requestId: 'req-999' },
      });
    });
  });

  describe('errorResponse', () => {
    it('returns error without code/requestId if missing', async () => {
      const c = mockContext();
      const res = errorResponse(c, 400, 'Bad req');
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Bad req' });
    });

    it('returns error with code and requestId', async () => {
      const c = mockContext('my-req');
      const res = errorResponse(c, 500, 'Server fail', 'SHARE_LOAD_FAILED');
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({
        error: 'Server fail',
        code: 'SHARE_LOAD_FAILED',
        requestId: 'my-req',
      });
    });
  });

  describe('parseJsonBodyWithLimit', () => {
    it('rejects if Content-Length header far exceeds limit', async () => {
      const c = mockContext('', undefined, { 'content-length': '1000' });
      const result = await parseJsonBodyWithLimit(c, 500);
      expect(result.ok).toBe(false);

      if (result.ok) throw new Error('Expected body rejection');
      expect(result.response.status).toBe(413);
      expect(await result.response.json()).toEqual(
        expect.objectContaining({ code: 'PAYLOAD_TOO_LARGE' }),
      );
    });

    it('rejects a request without a body', async () => {
      const c = mockContext('');
      const result = await parseJsonBodyWithLimit(c, 500);
      expect(result.ok).toBe(false);

      if (result.ok) throw new Error('Expected body rejection');
      expect(result.response.status).toBe(400);
      expect(await result.response.json()).toEqual(
        expect.objectContaining({ code: 'INVALID_JSON' }),
      );
    });

    it('rejects if actual body encoded length exceeds maxBytes', async () => {
      const longString = 'a'.repeat(600);
      const c = mockContext('', longString);
      const result = await parseJsonBodyWithLimit(c, 500);
      expect(result.ok).toBe(false);

      if (result.ok) throw new Error('Expected body rejection');
      expect(result.response.status).toBe(413);
      expect(await result.response.json()).toEqual(
        expect.objectContaining({ code: 'PAYLOAD_TOO_LARGE' }),
      );
    });

    it('rejects invalid json', async () => {
      const c = mockContext('', 'not-json');
      const result = await parseJsonBodyWithLimit(c, 500);
      expect(result.ok).toBe(false);

      if (result.ok) throw new Error('Expected body rejection');
      expect(result.response.status).toBe(400);
      expect(await result.response.json()).toEqual(
        expect.objectContaining({ code: 'INVALID_JSON' }),
      );
    });

    it('parses valid json successfully', async () => {
      const c = mockContext('', '{"hello":"world"}');
      const result = await parseJsonBodyWithLimit(c, 500);
      expect(result).toEqual({ ok: true, data: { hello: 'world' } });
    });
  });
});
