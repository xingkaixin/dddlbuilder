import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from 'evlog';
import type { ApiEnv } from '../../lib/context.js';
import { configureWorkerLogging, withWorkerRequestLogging } from '../../lib/logging.js';

type CapturedEvent = {
  service?: string;
  sql?: string;
  credentials?: { token?: string };
};

type ConsoleValue = CapturedEvent | string | number | boolean | null | undefined;

const isCapturedEvent = (value: ConsoleValue): value is CapturedEvent =>
  value !== null && typeof value === 'object' && 'service' in value;

const captureEvents = () => {
  const events: CapturedEvent[] = [];

  const spies = (['log', 'info', 'warn', 'error'] as const).map((method) =>
    vi.spyOn(console, method).mockImplementation((value: ConsoleValue) => {
      if (isCapturedEvent(value) && value.service === 'ddlbuilder-worker') {
        events.push(value);
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

  it('stays silent across environment updates when disabled by test setup', async () => {
    const captured = captureEvents();
    const fetchHandler = withWorkerRequestLogging(() => new Response('ok', { status: 200 }));
    // SAFETY: the stubbed handler does not read Cloudflare resource bindings.
    const env = { ENVIRONMENT: 'staging' } as ApiEnv['Bindings'];

    const response = await fetchHandler(new Request('https://example.com/api/workspaces'), env);

    expect(response.status).toBe(200);
    expect(captured.events).toHaveLength(0);
    captured.restore();
  });
});
