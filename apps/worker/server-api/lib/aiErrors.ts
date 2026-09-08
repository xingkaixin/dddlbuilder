import * as Data from 'effect/Data';

export class AIProviderError extends Data.TaggedError('AIProviderError')<{
  readonly cause: unknown;
}> {
  readonly message = 'Upstream OpenAI error';
}

export class AIUsageError extends Data.TaggedError('AIUsageError')<{
  readonly cause: unknown;
}> {
  readonly message = 'AI usage service unavailable';
}

export class AIOutputError extends Data.TaggedError('AIOutputError')<{
  readonly reason: 'truncated' | 'incomplete' | 'empty' | 'invalid-json' | 'invalid-schema';
  readonly cause?: unknown;
}> {
  get message() {
    return this.reason === 'truncated'
      ? 'AI output exceeded the token limit'
      : 'Invalid AI completion';
  }
}

export type AICompletionError = AIProviderError | AIUsageError | AIOutputError;

export class AIGovernanceError extends Data.TaggedError('AIGovernanceError')<{
  readonly phase: 'authentication' | 'rate_limit' | 'budget_reservation';
  readonly cause: unknown;
}> {
  readonly message = 'AI governance unavailable';
}
