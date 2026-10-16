import type { ApiEnv } from './context.js';
import type { AIRouteKey } from './aiRouteKey.js';
import { DomainError } from './http.js';
import { readSessionAccess } from './auth.js';
import { buildOpenAIConfig } from './openaiConfig.js';
import { reserveAIDailyBudget, settleAIDailyBudget } from './aiBudget.js';
import { reserveAIUsage, prepareAIUsageSettlement, finalizeAIUsageSettlement } from './aiUsage.js';
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

export const assertAIOperationAccess = async (env: ApiEnv['Bindings'], operation: AIOperation) => {
  const access = await readSessionAccess(env, operation.user_id);

  if (!access.sessionIds.has(operation.session_id)) {
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

export const settleAICalls = async (
  env: ApiEnv['Bindings'],
  operationId: string,
  route: AIRouteKey,
  successfulOutput?: boolean,
) => {
  const operation = await readAIOperation(env, operationId);

  if (!operation) throw new Error('AI operation missing');

  const { results } = await env.USER_DB.prepare(
    'SELECT * FROM ai_call_attempts WHERE operation_id = ?',
  )
    .bind(operationId)
    .all<CallAttempt>();

  for (const call of results) {
    const usage = await env.USER_DB.prepare('SELECT status FROM usage_events WHERE id = ?')
      .bind(call.usage_id)
      .first<{ status: string }>();

    if (!usage) continue;

    if (call.dispatched_at !== null)
      await env.USER_DB.prepare(
        "UPDATE usage_events SET attempt_count = 1 WHERE id = ? AND status = 'reserved' AND attempt_count = 0",
      )
        .bind(call.usage_id)
        .run();

    const reservation = {
      usageEventId: call.usage_id,
      userId: operation.user_id,
      routeKey: route,
      requestId: operationId,
      reservedTokens: call.estimated_tokens,
    };
    const charged = chargedCallTokens(call);
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

    if (prepared.needsFinalization)
      await finalizeAIUsageSettlement(env, reservation, outcome, code);
    await settleAIDailyBudget(env, call.usage_id, prepared.providerBudgetTokens);
  }
};

export const admitAICall = async (
  env: ApiEnv['Bindings'],
  operationId: string,
  route: AIRouteKey,
  model: string,
  estimate: { inputTokens: number; maxOutputTokens: number },
) => {
  const estimatedTokens = estimate.inputTokens + estimate.maxOutputTokens;
  const operation = await readAIOperation(env, operationId);

  if (!operation) throw new Error('AI operation missing');
  await assertAIOperationAccess(env, operation);
  await settleAICalls(env, operationId, route);

  const count = await env.USER_DB.prepare(
    'SELECT COUNT(*) AS count FROM ai_call_attempts WHERE operation_id = ?',
  )
    .bind(operationId)
    .first<{ count: number }>();

  if ((count?.count ?? 0) >= AI_MAX_CALLS) throw new Error('AI model call limit reached');
  const id = crypto.randomUUID();
  const usageId = `usage:${id}`;
  await env.USER_DB.prepare(`INSERT INTO ai_call_attempts (id, operation_id, usage_id, provider, model, estimated_tokens, estimated_input_tokens, created_at)
    VALUES (?, ?, ?, 'anthropic', ?, ?, ?, ?)`)
    .bind(id, operationId, usageId, model, estimatedTokens, estimate.inputTokens, Date.now())
    .run();
  await reserveAIUsage(env, {
    userId: operation.user_id,
    routeKey: route,
    requestId: operationId,
    estimatedTokens,
    usageEventId: usageId,
  });
  const config = buildOpenAIConfig(env);

  if (config.dailyBudgetEnabled) {
    const budget = await reserveAIDailyBudget(
      env,
      usageId,
      estimatedTokens,
      config.dailyBudgetMaxTokens,
    );

    if (budget === null)
      throw new DomainError(503, 'SERVICE_UNAVAILABLE', 'AI daily budget exhausted');
  }

  // Mark before dispatch: a crash between this commit and fetch is conservatively treated as possible usage.
  const dispatched =
    await env.USER_DB.prepare(`UPDATE ai_call_attempts SET dispatched_at = ? WHERE id = ?
    AND EXISTS (SELECT 1 FROM ai_operations WHERE id = ? AND stopped_at IS NULL AND completed_at IS NULL AND deadline_at > ?)
    RETURNING id`)
      .bind(Date.now(), id, operationId, Date.now())
      .first();

  if (!dispatched) throw new Error('AI operation stopped before model dispatch');
  await env.USER_DB.prepare(
    "UPDATE usage_events SET attempt_count = 1 WHERE id = ? AND status = 'reserved'",
  )
    .bind(usageId)
    .run();

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
