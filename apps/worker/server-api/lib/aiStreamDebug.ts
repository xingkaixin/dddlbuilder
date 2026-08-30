import type { AIRouteKey } from './aiRouteKey.js';
import type { WorkerRequestLogger } from './context.js';

type StreamDebugLoggerOptions = {
  enabled: boolean;
  requestId: string;
  route: AIRouteKey;
  model: string;
  startedAt: number;
  input: Record<string, unknown>;
  log?: WorkerRequestLogger;
};

type ChunkSnapshot = {
  chunkIndex: number;
  chunkSize: number;
  totalChars: number;
  elapsedMs: number;
  firstChunkLatencyMs: number | null;
};

const shouldLogChunk = (chunkIndex: number) => chunkIndex <= 5 || chunkIndex % 20 === 0;

export const createOpenAIStreamDebugLogger = ({
  enabled,
  requestId,
  route,
  model,
  startedAt,
  input,
  log,
}: StreamDebugLoggerOptions) => {
  let connectedAt: number | null = null;
  let firstChunkAt: number | null = null;
  let chunkCount = 0;
  let totalChars = 0;
  let terminal = false;

  const basePayload = {
    requestId,
    route,
    model,
  };

  const getElapsedMs = () => Date.now() - startedAt;

  const setDebug = (payload: Record<string, unknown>) => {
    if (!enabled || terminal) return;
    log?.set({ ai: { streamDebug: { ...basePayload, ...payload } } });
  };

  const getChunkSnapshot = (content: string): ChunkSnapshot => ({
    chunkIndex: chunkCount,
    chunkSize: content.length,
    totalChars,
    elapsedMs: getElapsedMs(),
    firstChunkLatencyMs: firstChunkAt === null ? null : firstChunkAt - startedAt,
  });

  return {
    start() {
      setDebug({
        phase: 'started',
        debugInput: input,
        elapsedMs: 0,
      });
    },
    connected() {
      connectedAt = Date.now();
      setDebug({
        phase: 'connected',
        elapsedMs: connectedAt - startedAt,
      });
    },
    chunk(content: string) {
      chunkCount += 1;
      totalChars += content.length;

      if (firstChunkAt === null) {
        firstChunkAt = Date.now();
        setDebug({
          phase: 'streaming',
          ...getChunkSnapshot(content),
        });
        return;
      }

      if (!shouldLogChunk(chunkCount)) {
        return;
      }

      setDebug({
        phase: 'streaming',
        ...getChunkSnapshot(content),
      });
    },
    complete() {
      if (terminal) return;
      setDebug({
        phase: 'completed',
        chunkCount,
        totalChars,
        elapsedMs: getElapsedMs(),
        firstChunkLatencyMs: firstChunkAt === null ? null : firstChunkAt - startedAt,
        connectedLatencyMs: connectedAt === null ? null : connectedAt - startedAt,
      });
      terminal = true;
    },
    error(error: unknown) {
      if (terminal) return;
      const message = error instanceof Error ? error.message : 'Unknown stream error';
      const stage = connectedAt !== null || chunkCount > 0 ? 'during_stream' : 'before_stream';

      setDebug({
        phase: 'failed',
        stage,
        chunkCount,
        totalChars,
        elapsedMs: getElapsedMs(),
        firstChunkLatencyMs: firstChunkAt === null ? null : firstChunkAt - startedAt,
        connectedLatencyMs: connectedAt === null ? null : connectedAt - startedAt,
        errorMessage: message,
      });
      terminal = true;
    },
  };
};
