import { encodeAIStreamEvent } from '@ddlbuilder/shared-types';

export function createAITextStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const text of chunks) {
        controller.enqueue(encoder.encode(encodeAIStreamEvent({ type: 'delta', text })));
      }
      controller.enqueue(encoder.encode(encodeAIStreamEvent({ type: 'done' })));
      controller.close();
    },
  });
}
