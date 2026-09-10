import * as Effect from 'effect/Effect';
import * as Fiber from 'effect/Fiber';
import * as Result from 'effect/Result';
import * as TestClock from 'effect/testing/TestClock';
import { describe, expect, it } from 'vitest';
import { withAIExecution } from '../../lib/aiExecution.js';

describe('AI execution scope', () => {
  it('does not start work when cancellation has already been requested', async () => {
    const controller = new AbortController();
    controller.abort();
    let started = false;
    await expect(
      Effect.runPromise(
        withAIExecution(
          Effect.sync(() => {
            started = true;
          }),
          controller,
          1000,
        ),
      ),
    ).rejects.toMatchObject({ _tag: 'AIProviderError' });
    expect(started).toBe(false);
  });

  it('aborts upstream work at the deadline and completes its finalizers', async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const controller = new AbortController();
        let released = false;

        const operation = Effect.never.pipe(
          Effect.ensuring(
            Effect.sync(() => {
              released = true;
            }),
          ),
        );
        const fiber = yield* Effect.forkChild(
          Effect.result(withAIExecution(operation, controller, 1000)),
        );
        yield* TestClock.adjust(999);
        expect(controller.signal.aborted).toBe(false);
        yield* TestClock.adjust(1);
        const result = yield* Fiber.join(fiber);
        expect(Result.isFailure(result)).toBe(true);
        expect(controller.signal.reason).toMatchObject({ name: 'TimeoutError' });
        expect(released).toBe(true);
      }).pipe(Effect.provide(TestClock.layer())),
    );
  });

  it('removes the deadline after successful completion', async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const controller = new AbortController();
        expect(yield* withAIExecution(Effect.succeed('done'), controller, 1000)).toBe('done');
        yield* TestClock.adjust(2000);
        expect(controller.signal.aborted).toBe(false);
      }).pipe(Effect.provide(TestClock.layer())),
    );
  });
});
