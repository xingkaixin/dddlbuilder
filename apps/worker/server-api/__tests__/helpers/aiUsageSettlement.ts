import type { ApiEnv } from '../../lib/context.js';
import { DomainError } from '../../lib/http.js';
import {
  prepareAIUsageSettlement,
  finalizeAIUsageSettlement,
  type AIUsageReservation,
  type AIUsageSettlement,
  type PreparedAIUsageSettlement,
} from '../../lib/aiUsage.js';

const settleUsage = async (
  env: ApiEnv['Bindings'],
  reservation: AIUsageReservation,
  status: 'succeeded' | 'failed',
  input: AIUsageSettlement,
  errorCode: string | null,
) => {
  let prepared: PreparedAIUsageSettlement;
  try {
    prepared = await prepareAIUsageSettlement(env, reservation, status, input, errorCode);
  } catch (error) {
    if (error instanceof DomainError && error.message === 'AI_USAGE_SETTLEMENT_NOT_PREPARED') {
      return false;
    }
    throw error;
  }
  if (!prepared.needsFinalization) return false;
  return finalizeAIUsageSettlement(env, reservation, status, errorCode);
};

export const completeAIUsage = async (
  env: ApiEnv['Bindings'],
  reservation: AIUsageReservation,
  settlement: AIUsageSettlement,
) => {
  await settleUsage(env, reservation, 'succeeded', settlement, null);
};

export const failAIUsage = async (
  env: ApiEnv['Bindings'],
  reservation: AIUsageReservation,
  errorCode: string,
  settlement: AIUsageSettlement,
) => {
  await settleUsage(env, reservation, 'failed', settlement, errorCode);
};
