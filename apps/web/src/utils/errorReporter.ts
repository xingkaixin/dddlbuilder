export interface ErrorContext {
  scope: string;
  action: string;
  metadata?: Record<string, unknown>;
}

export interface NormalizedErrorEvent {
  message: string;
  stack?: string;
  name: string;
  context: ErrorContext;
  timestamp: number;
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(typeof error === 'string' ? error : 'Unknown error');
}

export function reportError(error: unknown, context: ErrorContext): void {
  const normalized = normalizeError(error);
  const event: NormalizedErrorEvent = {
    message: normalized.message,
    stack: normalized.stack,
    name: normalized.name,
    context,
    timestamp: Date.now(),
  };

  // 默认行为: 开发期间仍可在控制台看到错误，后续可替换为监控 SDK 上报。
  console.error(`[${event.context.scope}] ${event.context.action}: ${event.message}`, normalized);
}
