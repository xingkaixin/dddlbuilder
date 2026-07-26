import { describe, it, expect } from 'vitest';
import type { Context } from 'hono';
import {
  getRequestId,
  withMeta,
  errorResponse,
  streamErrorPayload,
  parseJsonBodyWithLimit,
} from '../../lib/http';

describe('http lib utilities', () => {
  const mockContext = (
    requestId?: string,
    bodyText?: string,
    headers: Record<string, string> = {},
  ) => {
    return {
      get: (key: string) => {
        if (key === 'requestId') return requestId;
        return undefined;
      },
      json: (data: any, status: number) => ({ data, status }),
      req: {
        raw: new Request('http://localhost/test', {
          method: 'POST',
          ...(bodyText === undefined ? {} : { body: bodyText }),
        }),
        header: (name: string) => headers[name],
      },
    } as unknown as Context;
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
      const c = { get: () => 1234 } as unknown as Context;
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
    it('returns error without code/requestId if missing', () => {
      const c = mockContext();
      const res: any = errorResponse(c, 400, 'Bad req');
      expect(res.status).toBe(400);
      expect(res.data).toEqual({ error: 'Bad req' });
    });

    it('returns error with code and requestId', () => {
      const c = mockContext('my-req');
      const res: any = errorResponse(c, 500, 'Server fail', 'SHARE_LOAD_FAILED');
      expect(res.status).toBe(500);
      expect(res.data).toEqual({
        error: 'Server fail',
        code: 'SHARE_LOAD_FAILED',
        requestId: 'my-req',
      });
    });
  });

  describe('streamErrorPayload', () => {
    it('serializes basic error', () => {
      expect(streamErrorPayload('error')).toBe(JSON.stringify({ error: 'error' }));
    });
    it('serializes with code and request id', () => {
      const exact = JSON.stringify({
        error: 'err',
        code: 'INVALID_JSON',
        requestId: '1',
      });
      expect(streamErrorPayload('err', 'INVALID_JSON', '1')).toBe(exact);
    });
  });

  describe('parseJsonBodyWithLimit', () => {
    it('rejects if Content-Length header far exceeds limit', async () => {
      const c = mockContext('', undefined, { 'content-length': '1000' });
      const { data, errorResponse } = await parseJsonBodyWithLimit(c, 500);
      expect(data).toBeNull();
      expect((errorResponse as any).status).toBe(413);
      expect((errorResponse as any).data.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('rejects a request without a body', async () => {
      const c = mockContext('');
      const { data, errorResponse } = await parseJsonBodyWithLimit(c, 500);
      expect(data).toBeNull();
      expect((errorResponse as any).status).toBe(400);
      expect((errorResponse as any).data.code).toBe('INVALID_JSON');
    });

    it('rejects if actual body encoded length exceeds maxBytes', async () => {
      const longString = 'a'.repeat(600);
      const c = mockContext('', longString);
      const { data, errorResponse } = await parseJsonBodyWithLimit(c, 500);
      expect(data).toBeNull();
      expect((errorResponse as any).status).toBe(413);
      expect((errorResponse as any).data.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('rejects invalid json', async () => {
      const c = mockContext('', 'not-json');
      const { data, errorResponse } = await parseJsonBodyWithLimit(c, 500);
      expect(data).toBeNull();
      expect((errorResponse as any).status).toBe(400);
      expect((errorResponse as any).data.code).toBe('INVALID_JSON');
    });

    it('parses valid json successfully', async () => {
      const c = mockContext('', '{"hello":"world"}');
      const { data, errorResponse } = await parseJsonBodyWithLimit(c, 500);
      expect(errorResponse).toBeNull();
      expect(data).toEqual({ hello: 'world' });
    });
  });
});
