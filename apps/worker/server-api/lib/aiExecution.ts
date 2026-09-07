import * as Effect from 'effect/Effect';
import { AIProviderError } from './aiErrors.js';

export const withAIExecution = <A, E, R>(
  operation: Effect.Effect<A, E, R>,
  controller: AbortController,
  timeoutMs: number,
) =>
  Effect.scoped(
    Effect.gen(function* () {
      if (controller.signal.aborted) {
        return yield* new AIProviderError({ cause: controller.signal.reason });
      }
      const aborted = Effect.callback<never, AIProviderError>((resume) => {
        const onAbort = () =>
          resume(Effect.fail(new AIProviderError({ cause: controller.signal.reason })));
        if (controller.signal.aborted) {
          onAbort();
          return;
        }
        controller.signal.addEventListener('abort', onAbort, { once: true });
        return Effect.sync(() => controller.signal.removeEventListener('abort', onAbort));
      });
      yield* Effect.forkScoped(
        Effect.sleep(Math.max(0, timeoutMs)).pipe(
          Effect.tap(() =>
            Effect.sync(() =>
              controller.abort(new DOMException('AI execution timed out', 'TimeoutError')),
            ),
          ),
        ),
      );
      return yield* Effect.raceFirst(operation, aborted);
    }),
  );
