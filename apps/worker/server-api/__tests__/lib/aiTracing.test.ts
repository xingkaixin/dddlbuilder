import * as D1Client from '@effect/sql-d1/D1Client';
import { createSqliteD1Database } from '../helpers/sqliteD1.js';
import { reclaimStaleAIUsage } from '../../lib/aiUsage.js';
import type { ApiEnv } from '../../lib/context.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import * as Effect from 'effect/Effect';
import * as Tracer from 'effect/Tracer';
import { describe, expect, it, vi } from 'vitest';
import { makeAITracer } from '../../lib/aiTracing.js';

const recordingPlatform = () => {
  const active = new AsyncLocalStorage<string>();

  const spans: Array<{
    name: string;
    parent?: string;
    attributes: Map<string, unknown>;
    end: ReturnType<typeof vi.fn>;
  }> = [];
  const platform = {
    startActiveSpan<T>(
      name: string,
      callback: (span: Pick<Span, 'setAttribute' | 'recordException' | 'end'>) => T,
    ): T {
      const item = {
        name,
        parent: active.getStore(),
        attributes: new Map<string, unknown>(),
        end: vi.fn(),
      };
      spans.push(item);

      const span = {
        setAttribute(key: string, value: unknown) {
          item.attributes.set(key, value);

          return this as unknown as Span;
        },
        recordException: vi.fn(),
        end: item.end,
      };

      return active.run(name, () => callback(span));
    },
  };

  return { active, spans, platform };
};

describe('Effect to Worker tracing', () => {
  it('restores the active platform span across fiber scheduling and isolates siblings', async () => {
    const { platform, active, spans } = recordingPlatform();

    const child = (name: string) =>
      Effect.gen(function* () {
        yield* Effect.yieldNow;
        const before = active.getStore();

        const after = yield* Effect.promise(async () => {
          await Promise.resolve();

          return active.getStore();
        });
        const nested = yield* Effect.sync(() => active.getStore()).pipe(
          Effect.withSpan(`${name}.child`),
        );

        return { before, after, nested };
      }).pipe(Effect.withSpan(name));
    const result = await Effect.runPromise(
      Effect.all([child('left'), child('right')], { concurrency: 2 }).pipe(
        Effect.withSpan('root'),
        Effect.provideService(Tracer.Tracer, makeAITracer(platform)),
      ),
    );
    expect(result).toEqual([
      { before: 'left', after: 'left', nested: 'left.child' },
      { before: 'right', after: 'right', nested: 'right.child' },
    ]);
    expect(spans.map(({ name, parent }) => [name, parent])).toEqual(
      expect.arrayContaining([
        ['left', 'root'],
        ['right', 'root'],
        ['left.child', 'left'],
        ['right.child', 'right'],
      ]),
    );

    for (const span of spans) expect(span.end).toHaveBeenCalledOnce();
    expect(active.getStore()).toBeUndefined();
  });

  it('exports only approved attributes and does not expose failure messages', async () => {
    const { platform, spans } = recordingPlatform();
    await Effect.runPromise(
      Effect.fail(new Error('secret SQL')).pipe(
        Effect.withSpan('ai.request', { attributes: { sql: 'secret SQL', 'ai.route': 'review' } }),
        Effect.provideService(Tracer.Tracer, makeAITracer(platform)),
        Effect.ignore,
      ),
    );
    expect(Object.fromEntries(spans[0].attributes)).toEqual({
      'ai.route': 'review',
      'ai.outcome': 'failed',
      'ai.failure_kind': 'internal',
    });
  });

  it('preserves results when the telemetry API is unavailable', async () => {
    const tracer = makeAITracer({
      startActiveSpan() {
        throw new Error('Tracing unavailable');
      },
    });
    expect(
      await Effect.runPromise(
        Effect.succeed(42).pipe(
          Effect.withSpan('ai.request'),
          Effect.provideService(Tracer.Tracer, tracer),
        ),
      ),
    ).toBe(42);
  });
});

it('keeps D1 failure causes while excluding SQL from native recovery spans', async () => {
  const { database, sqlite } = createSqliteD1Database();
  const { platform, spans } = recordingPlatform();

  try {
    sqlite.exec('DROP TABLE usage_events');

    const result = await Effect.runPromise(
      reclaimStaleAIUsage({ USER_DB: database } as ApiEnv['Bindings']).pipe(
        Effect.provide(D1Client.layer({ db: database })),
        Effect.provideService(Tracer.Tracer, makeAITracer(platform)),
        Effect.result,
      ),
    );
    expect(result).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'SqlError', reason: { cause: expect.any(Error) } },
    });
    const query = spans.find((span) => span.name === 'sql.execute');
    expect(query?.parent).toBe('ai.usage.reclaim.scan');
    expect(Object.fromEntries(query?.attributes ?? [])).toEqual({
      'ai.outcome': 'failed',
      'ai.failure_kind': 'accounting',
    });

    for (const span of spans) expect(span.end).toHaveBeenCalledOnce();
  } finally {
    sqlite.close();
  }
});
