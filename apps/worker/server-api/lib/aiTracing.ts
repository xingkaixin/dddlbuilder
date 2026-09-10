/// <reference types="node" />
import { isSqlError } from 'effect/unstable/sql/SqlError';
import { AsyncLocalStorage } from 'node:async_hooks';
import * as Cause from 'effect/Cause';
import * as Clock from 'effect/Clock';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Option from 'effect/Option';
import * as Tracer from 'effect/Tracer';
import { DomainError } from './http.js';
import { AIOutputError, AIProviderError, AIUsageError, AIGovernanceError } from './aiErrors.js';

const ATTRIBUTES = new Set([
  'request.id',
  'ai.route',
  'ai.model',
  'ai.attempt',
  'ai.outcome',
  'ai.error_code',
  'ai.first_chunk_ms',
  'ai.retry_count',
  'ai.attempt_count',
  'ai.charged_tokens',
  'ai.accounting_finalized',
  'ai.failure_kind',
  'ai.finish_reason',
  'ai.output_chars',
]);

const safely = (operation: () => void) => {
  try {
    operation();
  } catch {
    /* Telemetry must not change request or settlement behavior. */
  }
};

class WorkerSpan extends Tracer.NativeSpan {
  private readonly platform: Pick<Span, 'setAttribute' | 'recordException' | 'end'>;
  constructor(
    options: ConstructorParameters<typeof Tracer.NativeSpan>[0],
    platform: Pick<Span, 'setAttribute' | 'recordException' | 'end'>,
  ) {
    super(options);
    this.platform = platform;
  }

  override attribute(key: string, value: unknown): void {
    if (!ATTRIBUTES.has(key) || !['string', 'number', 'boolean'].includes(typeof value)) return;
    super.attribute(key, value);
    safely(() => this.platform.setAttribute(key, value as string | number | boolean));
  }

  override end(endTime: bigint, exit: Exit.Exit<unknown, unknown>): void {
    if (this.status._tag === 'Ended') return;
    super.end(endTime, exit);
    const failure = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined;

    if (Exit.isFailure(exit)) this.attribute('ai.failure_kind', aiFailureKind(failure));

    if (failure instanceof DomainError) this.attribute('ai.error_code', failure.code);

    if (!this.attributes.has('ai.outcome') || Exit.isFailure(exit)) {
      this.attribute(
        'ai.outcome',
        Exit.isFailure(exit)
          ? Cause.hasInterruptsOnly(exit.cause)
            ? 'cancelled'
            : failure instanceof DomainError && failure.status < 500
              ? 'rejected'
              : 'failed'
          : 'succeeded',
      );
    }

    if (this.attributes.get('ai.outcome') === 'failed') {
      safely(() =>
        this.platform.recordException({
          name: 'AIOperationFailed',
          message: 'AI operation failed',
        }),
      );
    }

    safely(() => this.platform.end());
  }
}

export const makeAITracer = (platform: {
  startActiveSpan<T>(
    name: string,
    callback: (span: Pick<Span, 'setAttribute' | 'recordException' | 'end'>) => T,
  ): T;
}): Tracer.Tracer => {
  const contexts = new WeakMap<Tracer.AnySpan, ReturnType<typeof AsyncLocalStorage.snapshot>>();

  return Tracer.make({
    span(options) {
      const parent = Option.getOrUndefined(options.parent);
      const restore = parent ? contexts.get(parent) : undefined;

      const create = () =>
        platform.startActiveSpan(options.name, (platformSpan) => {
          const span = new WorkerSpan(options, platformSpan);
          contexts.set(span, AsyncLocalStorage.snapshot());

          return span;
        });

      try {
        return restore ? restore(create) : create();
      } catch {
        return new Tracer.NativeSpan(options);
      }
    },
    context(primitive, fiber) {
      const restore = fiber.currentSpan ? contexts.get(fiber.currentSpan) : undefined;
      const evaluate = () => primitive['~effect/Effect/evaluate'](fiber);

      return restore ? restore(evaluate) : evaluate();
    },
  });
};

export const endAIRequestSpan = (span: Tracer.Span, exit: Exit.Exit<unknown, unknown>) =>
  Effect.map(Clock.currentTimeNanos, (now) => {
    if (span.status._tag !== 'Ended') span.end(now, exit);
  });

export const aiFailureKind = (error: unknown): string => {
  if (error instanceof DomainError) return error.status < 500 ? 'rejected' : 'governance';
  if (error instanceof AIOutputError) return `output_${error.reason}`;
  if (error instanceof AIUsageError || isSqlError(error)) return 'accounting';
  if (error instanceof AIGovernanceError) return error.phase;

  if (error instanceof AIProviderError) {
    if (error.cause instanceof Error && error.cause.name === 'TimeoutError') return 'timeout';
    if (error.cause instanceof Error && error.cause.name === 'AbortError') return 'cancelled';

    return 'provider';
  }

  return 'internal';
};
