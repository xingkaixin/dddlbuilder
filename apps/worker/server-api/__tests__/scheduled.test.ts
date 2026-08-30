import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as AIBudgetModule from '../lib/aiBudget.js';
import type * as AIUsageModule from '../lib/aiUsage.js';
import type { ApiEnv } from '../lib/context.js';

const recoveryMocks = vi.hoisted(() => ({
  reclaimStaleAIUsage: vi.fn().mockResolvedValue({
    scanned: 1,
    reclaimed: 1,
    failures: [],
  }),
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
    vi.clearAllMocks();
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
