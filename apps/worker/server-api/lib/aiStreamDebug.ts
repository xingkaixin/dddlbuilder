import type { OpenAIRouteKey } from '../openaiControl.js';

type StreamDebugLoggerOptions = {
  enabled: boolean;
  requestId: string;
  route: OpenAIRouteKey;
  model: string;
  startedAt: number;
  input: Record<string, unknown>;
};

type ChunkSnapshot = {
  chunkIndex: number;
  chunkSize: number;
  totalChars: number;
  elapsedMs: number;
  firstChunkLatencyMs: number | null;
  preview: string;
};

const CHUNK_PREVIEW_LIMIT = 80;

const sanitizePreview = (text: string) =>
  text.replace(/\s+/g, ' ').trim().slice(0, CHUNK_PREVIEW_LIMIT);

const logEvent = (enabled: boolean, event: string, payload: Record<string, unknown>) => {
  if (!enabled) {
    return;
  }

  console.info(
    JSON.stringify({
      event,
      ts: new Date().toISOString(),
      ...payload,
    }),
  );
};

const shouldLogChunk = (chunkIndex: number) => chunkIndex <= 5 || chunkIndex % 20 === 0;

export const createOpenAIStreamDebugLogger = ({
  enabled,
  requestId,
  route,
  model,
  startedAt,
  input,
}: StreamDebugLoggerOptions) => {
  let connectedAt: number | null = null;
  let firstChunkAt: number | null = null;
  let chunkCount = 0;
  let totalChars = 0;

  const basePayload = {
    requestId,
    route,
    model,
  };

  const getElapsedMs = () => Date.now() - startedAt;

  const getChunkSnapshot = (content: string): ChunkSnapshot => ({
    chunkIndex: chunkCount,
    chunkSize: content.length,
    totalChars,
    elapsedMs: getElapsedMs(),
    firstChunkLatencyMs: firstChunkAt === null ? null : firstChunkAt - startedAt,
    preview: sanitizePreview(content),
  });

  return {
    start() {
      logEvent(enabled, 'ai_stream_start', {
        ...basePayload,
        stream: true,
        input,
        elapsedMs: 0,
      });
    },
    connected() {
      connectedAt = Date.now();
      logEvent(enabled, 'ai_stream_openai_connected', {
        ...basePayload,
        elapsedMs: connectedAt - startedAt,
      });
    },
    chunk(content: string) {
      chunkCount += 1;
      totalChars += content.length;

      if (firstChunkAt === null) {
        firstChunkAt = Date.now();
        logEvent(enabled, 'ai_stream_first_chunk', {
          ...basePayload,
          ...getChunkSnapshot(content),
        });
        return;
      }

      if (!shouldLogChunk(chunkCount)) {
        return;
      }

      logEvent(enabled, 'ai_stream_chunk', {
        ...basePayload,
        ...getChunkSnapshot(content),
      });
    },
    complete() {
      logEvent(enabled, 'ai_stream_complete', {
        ...basePayload,
        chunkCount,
        totalChars,
        elapsedMs: getElapsedMs(),
        firstChunkLatencyMs: firstChunkAt === null ? null : firstChunkAt - startedAt,
        connectedLatencyMs: connectedAt === null ? null : connectedAt - startedAt,
        reason: 'done',
      });
    },
    error(error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown stream error';
      const stage = connectedAt !== null || chunkCount > 0 ? 'during_stream' : 'before_stream';

      logEvent(enabled, 'ai_stream_error', {
        ...basePayload,
        stage,
        chunkCount,
        totalChars,
        elapsedMs: getElapsedMs(),
        firstChunkLatencyMs: firstChunkAt === null ? null : firstChunkAt - startedAt,
        connectedLatencyMs: connectedAt === null ? null : connectedAt - startedAt,
        errorMessage: message,
      });
    },
  };
};
