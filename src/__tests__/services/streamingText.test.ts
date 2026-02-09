import { describe, it, expect } from 'vitest';
import { readTextStream } from '@/services/streamingText';

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
  it('should return full text and emit first chunk + final result', async () => {
    const updates: string[] = [];
    const stream = createTextStream(['{"a":', '1}']);

    const fullText = await readTextStream(stream, {
      updateIntervalMs: 1000,
      onUpdate: (text) => updates.push(text),
    });

    expect(fullText).toBe('{"a":1}');
    expect(updates).toEqual(['{"a":', '{"a":1}']);
  });

  it('should return empty string for empty stream', async () => {
    const stream = createTextStream([]);
    const updates: string[] = [];

    const fullText = await readTextStream(stream, {
      onUpdate: (text) => updates.push(text),
    });

    expect(fullText).toBe('');
    expect(updates).toHaveLength(0);
  });
});
