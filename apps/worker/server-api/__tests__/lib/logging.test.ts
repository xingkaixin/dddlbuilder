import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from 'evlog';
import { configureWorkerLogging } from '../../lib/logging.js';

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
});
