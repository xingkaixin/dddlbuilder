import * as Effect from 'effect/Effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as AIBudgetModule from '../lib/aiBudget.js';
import type * as AIUsageModule from '../lib/aiUsage.js';
import type { ApiEnv } from '../lib/context.js';

const recoveryMocks = vi.hoisted(() => ({
  reclaimStaleAIUsage: vi.fn(),
  reconcileTerminalAIBudgets: vi.fn().mockResolvedValue(1),
  cleanupAIGovernance: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../lib/aiUsage.js', async (importOriginal) => ({
  ...(await importOriginal<typeof AIUsageModule>()),
  reclaimStaleAIUsage: recoveryMocks.reclaimStaleAIUsage,
}));

vi.mock('../lib/aiBudget.js', async (importOriginal) => ({
  ...(await importOriginal<typeof AIBudgetModule>()),
  reconcileTerminalAIBudgets: recoveryMocks.reconcileTerminalAIBudgets,
  cleanupAIGovernance: recoveryMocks.cleanupAIGovernance,
}));

import worker from '../../api/index.js';

describe('scheduled recovery', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    recoveryMocks.reconcileTerminalAIBudgets.mockResolvedValue(1);
    recoveryMocks.cleanupAIGovernance.mockResolvedValue(undefined);
    recoveryMocks.reclaimStaleAIUsage.mockReturnValue(
      Effect.succeed({ scanned: 1, reclaimed: 1, failures: [] }),
    );
  });

  it('将完整恢复任务交给 waitUntil', async () => {
    const env = {} as ApiEnv['Bindings'];
    const waitUntil = vi.fn<(promise: Promise<unknown>) => void>();
    const ctx = {
      waitUntil,
      passThroughOnException: vi.fn(),
    } as unknown as ExecutionContext;

    await worker.scheduled({} as ScheduledEvent, env, ctx);

    expect(waitUntil).toHaveBeenCalledOnce();
    const [task] = waitUntil.mock.calls[0] as [Promise<unknown>];
    expect(task).toBeInstanceOf(Promise);

    await task;

    expect(recoveryMocks.reclaimStaleAIUsage).toHaveBeenCalledOnce();
    expect(recoveryMocks.reclaimStaleAIUsage).toHaveBeenCalledWith(env);
    expect(recoveryMocks.reconcileTerminalAIBudgets).toHaveBeenCalledOnce();
    expect(recoveryMocks.reconcileTerminalAIBudgets).toHaveBeenCalledWith(env);
    expect(recoveryMocks.cleanupAIGovernance).toHaveBeenCalledOnce();
    expect(recoveryMocks.cleanupAIGovernance).toHaveBeenCalledWith(env);
  });
});

describe('scheduled recovery failures', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    recoveryMocks.reconcileTerminalAIBudgets.mockResolvedValue(1);
    recoveryMocks.cleanupAIGovernance.mockResolvedValue(undefined);
  });

  it('finishes budget reconciliation after individual usage failures', async () => {
    recoveryMocks.reclaimStaleAIUsage.mockReturnValue(
      Effect.succeed({
        scanned: 2,
        reclaimed: 1,
        failures: [{ usageEventId: 'broken', error: new Error('D1 write failed') }],
      }),
    );
    const waitUntil = vi.fn<(promise: Promise<unknown>) => void>();
    await worker.scheduled(
      {} as ScheduledEvent,
      {} as ApiEnv['Bindings'],
      { waitUntil } as unknown as ExecutionContext,
    );
    await waitUntil.mock.calls[0]?.[0];
    expect(recoveryMocks.reconcileTerminalAIBudgets).toHaveBeenCalledOnce();
    expect(recoveryMocks.cleanupAIGovernance).toHaveBeenCalledOnce();
  });

  it('rejects the background task when scanning fails', async () => {
    const failure = new Error('D1 unavailable');
    recoveryMocks.reclaimStaleAIUsage.mockReturnValue(Effect.fail(failure));
    const waitUntil = vi.fn<(promise: Promise<unknown>) => void>();
    await worker.scheduled(
      {} as ScheduledEvent,
      {} as ApiEnv['Bindings'],
      { waitUntil } as unknown as ExecutionContext,
    );
    await expect(waitUntil.mock.calls[0]?.[0]).rejects.toBe(failure);
    expect(recoveryMocks.reconcileTerminalAIBudgets).not.toHaveBeenCalled();
    expect(recoveryMocks.cleanupAIGovernance).not.toHaveBeenCalled();
  });
});
