import { describe, it, expect } from 'vitest';
import { readTextStream } from '@/services/streamingText';
import { createAITextStream } from '@/__tests__/utils/aiStream';

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

describe('readTextStream', () => {
  it.each(['', '{"type":"delta","text":"partial"}\n'])(
    'rejects an upstream error after %j instead of returning success',
    async (prefix) => {
      const stream = createTextStream([
        prefix,
        '{"type":"error","error":"Upstream OpenAI error","code":"UPSTREAM_OPENAI_ERROR"}\n',
      ]);
      await expect(
        readTextStream(stream, { debugContext: { route: 'review', forceDebug: true } }),
      ).rejects.toThrow('AI');
      expect(stream.locked).toBe(false);
    },
  );

  it('rejects a truncated stream without a completion event', async () => {
    await expect(
      readTextStream(createTextStream(['{"type":"delta","text":"partial"}\n']), {
        debugContext: { route: 'review', forceDebug: true },
      }),
    ).rejects.toThrow('AI');
  });

  it('should return full text and emit first chunk + final result', async () => {
    const updates: string[] = [];
    const stream = createAITextStream(['{"a":', '1}']);

    const fullText = await readTextStream(stream, {
      updateIntervalMs: 1000,
      onUpdate: (text) => updates.push(text),
    });

    expect(fullText).toBe('{"a":1}');
    expect(updates).toEqual(['{"a":', '{"a":1}']);
  });

  it('should return empty string for empty stream', async () => {
    const stream = createAITextStream([]);
    const updates: string[] = [];

    const fullText = await readTextStream(stream, {
      onUpdate: (text) => updates.push(text),
    });

    expect(fullText).toBe('');
    expect(updates).toHaveLength(0);
  });

  it('decodes split UTF-8 bytes and multiple events in a chunk', async () => {
    const wire = new TextEncoder().encode(
      '{"type":"delta","text":"中文\\n"}\n{"type":"delta","text":"完成"}\n{"type":"done"}\n',
    );
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const byte of wire) controller.enqueue(Uint8Array.of(byte));
        controller.close();
      },
    });
    expect(await readTextStream(stream)).toBe('中文\n完成');
    expect(stream.locked).toBe(false);
    expect(await readTextStream(createTextStream([new TextDecoder().decode(wire)]))).toBe(
      '中文\n完成',
    );
  });

  it.each([
    '',
    '{"type":"unknown"}\n',
    '{"type":"delta","text":1}\n',
    '{"type":"done"}\ntruncated',
  ])('rejects invalid or incomplete framing: %j', async (wire) => {
    await expect(readTextStream(createTextStream([wire]))).rejects.toThrow('AI');
  });
});
