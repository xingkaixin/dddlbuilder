import { logAiStreamDebug } from '@/services/aiStreamDebug';

const DEFAULT_STREAM_UPDATE_INTERVAL_MS = 33;

interface ReadTextStreamOptions {
  onUpdate?: (text: string) => void;
  updateIntervalMs?: number;
  debugContext?: {
    route: string;
    requestId?: string | null;
    forceDebug?: boolean;
  };
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
  const debugContext = options.debugContext;
  const startedAt = Date.now();

  let fullText = '';
  let lastEmittedText = '';
  let hasEmittedFirstChunk = false;
  let lastEmitAt = 0;
  let chunkCount = 0;
  let totalBytes = 0;
  let firstChunkAt: number | null = null;

  const emitText = (
    reason: 'first_chunk' | 'throttled' | 'final',
    emittedAt = Date.now(),
  ) => {
    if (!onUpdate) {
      return;
    }
    lastEmittedText = fullText;
    onUpdate(lastEmittedText);
    logAiStreamDebug(
      'ai_stream_update_emit',
      {
        ...debugContext,
        reason,
        totalChars: fullText.length,
        elapsedMs: emittedAt - startedAt,
        sinceLastEmitMs: lastEmitAt === 0 ? null : emittedAt - lastEmitAt,
      },
      { force: debugContext?.forceDebug },
    );
  };

  logAiStreamDebug(
    'ai_stream_read_start',
    {
      ...debugContext,
      elapsedMs: 0,
    },
    { force: debugContext?.forceDebug },
  );

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      chunkCount += 1;
      totalBytes += value.byteLength;
      fullText += decoder.decode(value, { stream: true });

      if (!hasEmittedFirstChunk) {
        hasEmittedFirstChunk = true;
        firstChunkAt = Date.now();
        logAiStreamDebug(
          'ai_stream_first_chunk',
          {
            ...debugContext,
            chunkIndex: chunkCount,
            chunkBytes: value.byteLength,
            totalBytes,
            totalChars: fullText.length,
            elapsedMs: firstChunkAt - startedAt,
            firstChunkLatencyMs: firstChunkAt - startedAt,
          },
          { force: debugContext?.forceDebug },
        );
        emitText('first_chunk', firstChunkAt);
        lastEmitAt = firstChunkAt;
        continue;
      }

      const now = Date.now();
      if (now - lastEmitAt >= updateIntervalMs) {
        emitText('throttled', now);
        lastEmitAt = now;
      }
    }
  } catch (error) {
    logAiStreamDebug(
      'ai_stream_read_error',
      {
        ...debugContext,
        chunkCount,
        totalBytes,
        totalChars: fullText.length,
        elapsedMs: Date.now() - startedAt,
        errorName: error instanceof Error ? error.name : 'UnknownError',
        errorMessage:
          error instanceof Error ? error.message : 'Unknown stream read error',
      },
      { force: debugContext?.forceDebug },
    );
    throw error;
  }

  const tail = decoder.decode();
  if (tail) {
    fullText += tail;
  }

  if (lastEmittedText !== fullText) {
    const completedAt = Date.now();
    emitText('final', completedAt);
    lastEmitAt = completedAt;
  }

  logAiStreamDebug(
    'ai_stream_read_complete',
    {
      ...debugContext,
      chunkCount,
      totalBytes,
      totalChars: fullText.length,
      elapsedMs: Date.now() - startedAt,
      firstChunkLatencyMs:
        firstChunkAt === null ? null : firstChunkAt - startedAt,
    },
    { force: debugContext?.forceDebug },
  );

  return fullText;
}
