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
      body: createTextStream(['{"score": 99, "summary": "ok", "suggestions": []}']),
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

  it('should handle non-ok response with invalid JSON body via catch block', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 502,
      json: () => Promise.reject(new Error('Unexpected end of JSON input')),
    } as unknown as Response);

    await expect(
      requestDDLReview(
        { ddl: 'ddl', tableName: 'users', dbType: 'mysql' },
        { signal: new AbortController().signal },
      ),
    ).rejects.toThrow('请求失败: 502');
  });

  it('should throw error when missing response body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      body: null,
      json: vi.fn(),
    } as unknown as Response);

    await expect(
      requestDDLReview(
        { ddl: 'ddl', tableName: 'users', dbType: 'mysql' },
        { signal: new AbortController().signal },
      ),
    ).rejects.toThrow('无法读取响应流');
  });

  it('should throw parse error when stream contains no JSON object', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      body: createTextStream(['this is not valid json!']),
      json: vi.fn(),
    } as unknown as Response);

    await expect(
      requestDDLReview(
        { ddl: 'ddl', tableName: 'users', dbType: 'mysql' },
        { signal: new AbortController().signal },
      ),
    ).rejects.toThrow('无法解析评审结果');
  });

  it('should normalize invalid summary and non-array suggestions', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      body: createTextStream(['{"score": "abc", "summary": 123, "suggestions": "not_an_array"}']),
      json: vi.fn(),
    } as unknown as Response);

    const result = await requestDDLReview(
      { ddl: 'ddl', tableName: 'users', dbType: 'mysql' },
      { signal: new AbortController().signal },
    );

    expect(result.score).toBe(5);
    expect(result.summary).toBe('评审完成');
    expect(result.suggestions).toEqual([]);
  });

  it('should handle null payload via JSON.parse intervention', async () => {
    const parseSpy = vi.spyOn(JSON, 'parse').mockReturnValue(null);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      body: createTextStream(['{}']),
      json: vi.fn(),
    } as unknown as Response);

    const result = await requestDDLReview(
      { ddl: 'ddl', tableName: 'users', dbType: 'mysql' },
      { signal: new AbortController().signal },
    );

    expect(result.score).toBe(5);
    expect(result.summary).toBe('评审完成');
    expect(result.suggestions).toEqual([]);

    parseSpy.mockRestore();
  });
});
