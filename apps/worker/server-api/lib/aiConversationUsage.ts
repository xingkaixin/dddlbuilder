import type { ApiEnv } from './context.js';
import type { AIRouteKey } from './aiRouteKey.js';
import { DomainError } from './http.js';
import { buildOpenAIConfig } from './openaiConfig.js';
import {
  isAIDailyBudgetExceeded,
  prepareAIDailyBudgetReservation,
  settleAIDailyBudget,
} from './aiBudget.js';
import {
  finalizeAIUsageSettlement,
  isTerminalAIUsageStatus,
  mapAIUsageReservationError,
  prepareAIUsageReservation,
  prepareAIUsageSettlement,
} from './aiUsage.js';
import { AI_MAX_CALLS } from './aiConversationConfig.js';

export type AIOperation = {
  id: string;
  conversation_id: string;
  user_id: string;
  session_id: string;
  input_hash: string | null;
  submitted_at: number | null;
  deadline_at: number | null;
  stopped_at: number | null;
  completed_at: number | null;
};

export type AIOperationAccess = AIOperation & { session_active: number };

type CallAttempt = {
  id: string;
  operation_id: string;
  usage_id: string;
  estimated_tokens: number;
  estimated_input_tokens: number;
  dispatched_at: number | null;
  observed_tokens: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_write_tokens: number | null;
  usage_complete: number;
  succeeded: number;
  output_chars: number;
  completed_at: number | null;
  user_id: string;
  usage_status: string | null;
  usage_attempt_count: number | null;
};

const chargedCallTokens = (call: CallAttempt) => {
  if (call.dispatched_at === null) return 0;

  if (call.usage_complete) return call.observed_tokens ?? 0;

  // Without a receipt the process was lost mid-call, so nothing bounds the provider usage.
  if (call.completed_at === null) return Math.max(call.estimated_tokens, call.observed_tokens ?? 0);

  const observedInput =
    (call.input_tokens ?? 0) + (call.cache_read_tokens ?? 0) + (call.cache_write_tokens ?? 0);
  // Anthropic reports output tokens only at stream end; received characters bound a stopped stream.
  const output = Math.min(
    call.estimated_tokens - call.estimated_input_tokens,
    Math.max(call.output_tokens ?? 0, call.output_chars),
  );

  return (observedInput || call.estimated_input_tokens) + output;
};

export const readAIOperation = (env: ApiEnv['Bindings'], id: string) =>
  env.USER_DB.prepare('SELECT * FROM ai_operations WHERE id = ?').bind(id).first<AIOperation>();

export const readAIOperationAccess = (env: ApiEnv['Bindings'], id: string) =>
  env.USER_DB.prepare(`
    SELECT o.*, (
      EXISTS (
        SELECT 1 FROM session s
        WHERE s.id = o.session_id AND s.user_id = o.user_id AND s.expires_at > ?
      )
      AND NOT EXISTS (SELECT 1 FROM admin_user_flags f WHERE f.user_id = o.user_id)
    ) AS session_active
    FROM ai_operations o WHERE o.id = ?
  `)
    .bind(Date.now(), id)
    .first<AIOperationAccess>();

export const assertAIOperationAccess = (operation: AIOperationAccess) => {
  if (!operation.session_active) {
    throw new DomainError(401, 'AUTH_REQUIRED', 'AI operation authorization expired');
  }

  if (
    operation.stopped_at ||
    operation.completed_at ||
    !operation.deadline_at ||
    operation.deadline_at <= Date.now()
  ) {
    throw new DomainError(409, 'SERVICE_UNAVAILABLE', 'AI operation stopped or expired');
  }
};

const readCallAttempts = async (env: ApiEnv['Bindings'], operationId: string) => {
  const { results } = await env.USER_DB.prepare(`
    SELECT a.*, o.user_id, u.status AS usage_status, u.attempt_count AS usage_attempt_count
    FROM ai_call_attempts a
    JOIN ai_operations o ON o.id = a.operation_id
    LEFT JOIN usage_events u ON u.id = a.usage_id
    WHERE a.operation_id = ?
  `)
    .bind(operationId)
    .all<CallAttempt>();

  return results;
};

const settleCallAttempts = async (
  env: ApiEnv['Bindings'],
  operationId: string,
  route: AIRouteKey,
  attempts: readonly CallAttempt[],
  successfulOutput?: boolean,
) => {
  const summary = { calls: 0, inputTokens: 0, outputTokens: 0, chargedTokens: 0 };

  for (const call of attempts) {
    const charged = chargedCallTokens(call);

    if (call.dispatched_at !== null) summary.calls += 1;
    summary.inputTokens +=
      (call.input_tokens ?? 0) + (call.cache_read_tokens ?? 0) + (call.cache_write_tokens ?? 0);
    summary.outputTokens += call.output_tokens ?? 0;
    summary.chargedTokens += charged;

    // A crash after a terminal status leaves only the budget open, and Cron reconciles that.
    if (!call.usage_status || isTerminalAIUsageStatus(call.usage_status)) continue;

    // Admission sets both fields atomically; this repairs calls admitted before that batch.
    if (call.dispatched_at !== null && call.usage_attempt_count === 0)
      await env.USER_DB.prepare(
        "UPDATE usage_events SET attempt_count = 1 WHERE id = ? AND status = 'reserved' AND attempt_count = 0",
      )
        .bind(call.usage_id)
        .run();

    const reservation = {
      usageEventId: call.usage_id,
      userId: call.user_id,
      routeKey: route,
      requestId: operationId,
      reservedTokens: call.estimated_tokens,
    };
    const succeeded = call.succeeded === 1 && successfulOutput !== false;
    const outcome = succeeded ? 'succeeded' : 'failed';
    const code = succeeded ? null : 'RESERVATION_ABANDONED';

    const prepared = await prepareAIUsageSettlement(
      env,
      reservation,
      outcome,
      {
        observedTotalTokens: call.dispatched_at ? call.observed_tokens : 0,
        chargedTokens: charged,
        providerBudgetTokens: charged,
        usageEstimated: call.dispatched_at !== null && call.usage_complete === 0,
      },
      code,
    );

    await Promise.all([
      prepared.needsFinalization
        ? finalizeAIUsageSettlement(env, reservation, outcome, code)
        : undefined,
      settleAIDailyBudget(env, call.usage_id, prepared.providerBudgetTokens),
    ]);
  }

  return summary;
};

export const settleAICalls = async (
  env: ApiEnv['Bindings'],
  operationId: string,
  route: AIRouteKey,
  successfulOutput?: boolean,
) =>
  settleCallAttempts(
    env,
    operationId,
    route,
    await readCallAttempts(env, operationId),
    successfulOutput,
  );

export const admitAICall = async (
  env: ApiEnv['Bindings'],
  operationId: string,
  route: AIRouteKey,
  model: string,
  estimate: { inputTokens: number; maxOutputTokens: number },
) => {
  const estimatedTokens = estimate.inputTokens + estimate.maxOutputTokens;
  const operation = await readAIOperationAccess(env, operationId);

  if (!operation) throw new Error('AI operation missing');
  assertAIOperationAccess(operation);
  const attempts = await readCallAttempts(env, operationId);
  await settleCallAttempts(env, operationId, route, attempts);

  if (attempts.length >= AI_MAX_CALLS) throw new Error('AI model call limit reached');
  const id = crypto.randomUUID();
  const usageId = `usage:${id}`;
  const config = buildOpenAIConfig(env);

  const { statements: reservation } = prepareAIUsageReservation(env, {
    userId: operation.user_id,
    routeKey: route,
    requestId: operationId,
    estimatedTokens,
    usageEventId: usageId,
  });
  const budget = config.dailyBudgetEnabled
    ? [prepareAIDailyBudgetReservation(env, usageId, estimatedTokens, config.dailyBudgetMaxTokens)]
    : [];

  // Mark before dispatch: a crash between this commit and fetch is conservatively treated as possible usage.
  const dispatch = env.USER_DB.prepare(`UPDATE ai_call_attempts SET dispatched_at = ? WHERE id = ?
    AND EXISTS (SELECT 1 FROM usage_events WHERE id = ?)
    AND EXISTS (SELECT 1 FROM ai_operations WHERE id = ? AND stopped_at IS NULL AND completed_at IS NULL AND deadline_at > ?)
    RETURNING id`).bind(Date.now(), id, usageId, operationId, Date.now());

  const results = await env.USER_DB.batch([
    env.USER_DB.prepare(`INSERT INTO ai_call_attempts (id, operation_id, usage_id, provider, model, estimated_tokens, estimated_input_tokens, created_at)
    VALUES (?, ?, ?, 'anthropic', ?, ?, ?, ?)`).bind(
      id,
      operationId,
      usageId,
      model,
      estimatedTokens,
      estimate.inputTokens,
      Date.now(),
    ),
    ...reservation,
    ...budget,
    dispatch,
    env.USER_DB.prepare(`UPDATE usage_events SET attempt_count = 1 WHERE id = ? AND status = 'reserved'
    AND EXISTS (SELECT 1 FROM ai_call_attempts WHERE id = ? AND dispatched_at IS NOT NULL)`).bind(
      usageId,
      id,
    ),
    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- D1 trigger errors cross the database adapter as unknown.
  ]).catch((error: unknown) => {
    if (isAIDailyBudgetExceeded(error))
      throw new DomainError(503, 'SERVICE_UNAVAILABLE', 'AI daily budget exhausted');
    throw mapAIUsageReservationError(error);
  });

  if (!results[1]?.results.length)
    throw new DomainError(503, 'SERVICE_UNAVAILABLE', 'CREDIT_ACCOUNT_MISSING');

  if (!results.at(-2)?.results.length)
    throw new Error('AI operation stopped before model dispatch');

  return id;
};

export type AIUsageReceipt = {
  complete: boolean;
  succeeded: boolean;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
};

export const recordAICallUsage = async (
  env: ApiEnv['Bindings'],
  id: string,
  tokens: number,
  outputChars: number,
  receipt: AIUsageReceipt = { complete: true, succeeded: true },
) => {
  if (!Number.isSafeInteger(tokens) || tokens < 0) throw new Error('Invalid provider token usage');
  await env.USER_DB.prepare(
    `UPDATE ai_call_attempts SET observed_tokens = ?, output_chars = ?, input_tokens = ?, output_tokens = ?, cache_read_tokens = ?, cache_write_tokens = ?, usage_complete = ?, succeeded = ?, completed_at = ? WHERE id = ?`,
  )
    .bind(
      tokens,
      outputChars,
      receipt.inputTokens ?? null,
      receipt.outputTokens ?? null,
      receipt.cacheReadTokens ?? null,
      receipt.cacheWriteTokens ?? null,
      Number(receipt.complete),
      Number(receipt.succeeded),
      Date.now(),
      id,
    )
    .run();
};
