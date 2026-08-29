import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from 'evlog';
import type { ApiEnv } from '../../lib/context.js';
import { configureWorkerLogging, withWorkerRequestLogging } from '../../lib/logging.js';

const createEnv = (): ApiEnv['Bindings'] =>
  ({
    ASSETS: { fetch: globalThis.fetch },
    SHARE_KV: {} as KVNamespace,
    USER_DB: {} as D1Database,
  }) as ApiEnv['Bindings'];

const captureEvents = () => {
  const events: Array<Record<string, unknown>> = [];
  const spies = (['log', 'info', 'warn', 'error'] as const).map((method) =>
    vi.spyOn(console, method).mockImplementation((value: unknown) => {
      if (value && typeof value === 'object') {
        const event = value as Record<string, unknown>;
        if (event.service === 'ddlbuilder-worker') events.push(event);
      }
    }),
  );
  return {
    events,
    restore: () => {
      for (const spy of spies) spy.mockRestore();
    },
  };
};

afterEach(() => {
  configureWorkerLogging(false);
  vi.restoreAllMocks();
});

describe('worker request logging', () => {
  it('redacts protected fields before console output', () => {
    const captured = captureEvents();
    configureWorkerLogging(true);
    const log = createLogger({
      sql: 'select secret from users',
      credentials: { token: 'secret-token' },
    });

    log.emit();

    expect(captured.events).toHaveLength(1);
    expect(captured.events[0]).toMatchObject({
      sql: '[REDACTED]',
      credentials: { token: '[REDACTED]' },
    });
    captured.restore();
  });

  it('emits an NDJSON request only after the response body completes', async () => {
    const captured = captureEvents();
    configureWorkerLogging(true);
    let pullCount = 0;
    const fetch = withWorkerRequestLogging(
      () =>
        new Response(
          new ReadableStream({
            pull(controller) {
              if (pullCount === 0) {
                pullCount += 1;
                controller.enqueue(new TextEncoder().encode('{"chunk":1}\n'));
                return;
              }
              controller.close();
            },
          }),
          { headers: { 'content-type': 'application/x-ndjson' } },
        ),
    );

    const response = await fetch(new Request('https://ddlbuilder.test/api/stream'), createEnv());

    expect(captured.events).toHaveLength(0);
    expect(response.body?.locked).toBe(false);
    await response.text();
    expect(captured.events).toHaveLength(1);
    captured.restore();
  });

  it('emits an NDJSON request once when the client cancels the body', async () => {
    const captured = captureEvents();
    configureWorkerLogging(true);
    const fetch = withWorkerRequestLogging(
      () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('{"chunk":1}\n'));
            },
          }),
          { headers: { 'content-type': 'application/x-ndjson' } },
        ),
    );

    const response = await fetch(new Request('https://ddlbuilder.test/api/stream'), createEnv());
    const reader = response.body?.getReader();
    await reader?.read();
    await reader?.cancel();
    await Promise.resolve();

    expect(captured.events).toHaveLength(1);
    captured.restore();
  });
});
