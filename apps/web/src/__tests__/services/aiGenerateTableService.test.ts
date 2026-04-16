import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestGenerateTable } from '@/services/aiGenerateTableService';

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

describe('requestGenerateTable', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should parse final generated schema and stream updates', async () => {
    const updates: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      body: createTextStream([
        '{"tableName":"users","tableComment":"u",',
        '"fields":[],"indexes":[]}',
      ]),
      json: vi.fn(),
    } as unknown as Response);

    const result = await requestGenerateTable(
      {
        description: '生成用户表',
        dbType: 'mysql',
      },
      {
        signal: new AbortController().signal,
        onStreamingText: (text) => updates.push(text),
      },
    );

    expect(result.result.tableName).toBe('users');
    expect(result.result.fields).toEqual([]);
    expect(updates.length).toBeGreaterThan(0);
    expect(updates[updates.length - 1]).toBe(result.fullText);
  });

  it('should throw non-ok response error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn().mockResolvedValue({ error: '生成失败' }),
    } as unknown as Response);

    await expect(
      requestGenerateTable(
        {
          description: '生成用户表',
          dbType: 'mysql',
        },
        { signal: new AbortController().signal },
      ),
    ).rejects.toThrow('生成失败');
  });
});
