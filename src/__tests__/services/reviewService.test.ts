import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestDDLReview } from '@/services/reviewService';

function createTextStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => {
        controller.enqueue(encoder.encode(chunk));
      });
      controller.close();
    },
  });
}

describe('requestDDLReview', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should parse stream result and normalize score', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      body: createTextStream([
        '{"score": 99, "summary": "ok", "suggestions": []}',
      ]),
      json: vi.fn(),
    } as unknown as Response);

    const result = await requestDDLReview(
      { ddl: 'ddl', tableName: 'users', dbType: 'mysql' },
      { signal: new AbortController().signal },
    );

    expect(result.score).toBe(10);
    expect(result.summary).toBe('ok');
    expect(result.suggestions).toEqual([]);
  });

  it('should throw business error when response is non-ok', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn().mockResolvedValue({ error: 'boom' }),
    } as unknown as Response);

    await expect(
      requestDDLReview(
        { ddl: 'ddl', tableName: 'users', dbType: 'mysql' },
        { signal: new AbortController().signal },
      ),
    ).rejects.toThrow('boom');
  });
});
