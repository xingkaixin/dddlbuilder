export interface ErrorContext {
  scope: string;
  action: string;
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- logging preserves provider metadata for the reporter.
  metadata?: Record<string, unknown>;
}

// Errors cross browser, fetch, and SDK boundaries with no common runtime shape.
// oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof
function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error(typeof error === 'string' ? error : 'Unknown error');
}
// oxlint-enable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof

// Logging is the final boundary and accepts errors thrown by browser, fetch, and SDK code.
// oxlint-disable-next-line anti-slop/no-unknown-parameters
export function reportError(error: unknown, context: ErrorContext): void {
  const normalized = normalizeError(error);
  console.error(`[${context.scope}] ${context.action}: ${normalized.message}`, normalized);
}
