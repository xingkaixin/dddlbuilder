const DEFAULT_STREAM_UPDATE_INTERVAL_MS = 33;

interface ReadTextStreamOptions {
  onUpdate?: (text: string) => void;
  updateIntervalMs?: number;
}

export async function readTextStream(
  stream: ReadableStream<Uint8Array>,
  options: ReadTextStreamOptions = {},
): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const onUpdate = options.onUpdate;
  const updateIntervalMs =
    options.updateIntervalMs ?? DEFAULT_STREAM_UPDATE_INTERVAL_MS;

  let fullText = '';
  let lastEmittedText = '';
  let hasEmittedFirstChunk = false;
  let lastEmitAt = 0;

  const emitText = () => {
    if (!onUpdate) {
      return;
    }
    lastEmittedText = fullText;
    onUpdate(lastEmittedText);
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    fullText += decoder.decode(value, { stream: true });

    if (!hasEmittedFirstChunk) {
      hasEmittedFirstChunk = true;
      lastEmitAt = Date.now();
      emitText();
      continue;
    }

    const now = Date.now();
    if (now - lastEmitAt >= updateIntervalMs) {
      lastEmitAt = now;
      emitText();
    }
  }

  const tail = decoder.decode();
  if (tail) {
    fullText += tail;
  }

  if (lastEmittedText !== fullText) {
    emitText();
  }

  return fullText;
}
