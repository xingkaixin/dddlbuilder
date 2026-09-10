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

// oxlint-disable-next-line anti-slop/no-module-mocking -- inject recovery outcomes while exercising the real scheduled orchestration
vi.mock('../lib/aiUsage.js', async (importOriginal) => ({
  ...(await importOriginal<typeof AIUsageModule>()),
  reclaimStaleAIUsage: recoveryMocks.reclaimStaleAIUsage,
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- inject budget cleanup outcomes while exercising the real scheduled orchestration
vi.mock('../lib/aiBudget.js', async (importOriginal) => ({
  ...(await importOriginal<typeof AIBudgetModule>()),
  reconcileTerminalAIBudgets: recoveryMocks.reconcileTerminalAIBudgets,
  cleanupAIGovernance: recoveryMocks.cleanupAIGovernance,
}));

import worker from '../../api/index.js';

// SAFETY: the scheduled handler only passes these values through to mocked recovery functions.
const emptyEvent = {} as ScheduledEvent;
// SAFETY: recovery functions are mocked and do not read Worker bindings in this orchestration test.
const emptyEnv = {} as ApiEnv['Bindings'];

const createExecutionContext = (
  waitUntil: (promise: Promise<unknown>) => void,
): ExecutionContext => {
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- SAFETY: waitUntil and passThroughOnException are the complete context surface used by this test.
  return { waitUntil, passThroughOnException: vi.fn() } as unknown as ExecutionContext;
};

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
    const env = emptyEnv;
    const waitUntil = vi.fn<(promise: Promise<unknown>) => void>();

    const ctx = createExecutionContext(waitUntil);

    await worker.scheduled(emptyEvent, env, ctx);

    expect(waitUntil).toHaveBeenCalledOnce();
    const task = waitUntil.mock.calls[0]?.[0];
    expect(task).toBeInstanceOf(Promise);

    if (!task) throw new Error('Expected scheduled task');
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
    await worker.scheduled(emptyEvent, emptyEnv, createExecutionContext(waitUntil));
    await waitUntil.mock.calls[0]?.[0];
    expect(recoveryMocks.reconcileTerminalAIBudgets).toHaveBeenCalledOnce();
    expect(recoveryMocks.cleanupAIGovernance).toHaveBeenCalledOnce();
  });

  it('rejects the background task when scanning fails', async () => {
    const failure = new Error('D1 unavailable');
    recoveryMocks.reclaimStaleAIUsage.mockReturnValue(Effect.fail(failure));
    const waitUntil = vi.fn<(promise: Promise<unknown>) => void>();
    await worker.scheduled(emptyEvent, emptyEnv, createExecutionContext(waitUntil));
    await expect(waitUntil.mock.calls[0]?.[0]).rejects.toBe(failure);
    expect(recoveryMocks.reconcileTerminalAIBudgets).not.toHaveBeenCalled();
    expect(recoveryMocks.cleanupAIGovernance).not.toHaveBeenCalled();
  });
});
