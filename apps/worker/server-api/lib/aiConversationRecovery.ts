import type { ApiEnv } from './context.js';
import { AI_RETENTION_MS } from './aiConversationConfig.js';
import { settleAICalls } from './aiConversationUsage.js';
import { AI_USAGE_RECOVERY_RETRY_DELAY_MS } from './aiUsage.js';
import type { AIRouteKey } from './aiRouteKey.js';

// Bounds concurrent subrequests within one Cron invocation.
const RECOVERY_CONCURRENCY = 5;

type RecoverableOperation = {
  id: string;
  user_id: string;
  conversation_id: string;
  deadline_at: number;
  route_key: AIRouteKey;
};

const recoverOperation = async (
  env: ApiEnv['Bindings'],
  conversations: NonNullable<ApiEnv['Bindings']['AI_CONVERSATIONS']>,
  operation: RecoverableOperation,
) => {
  const expired = operation.deadline_at <= Date.now();

  try {
    if (expired)
      await env.USER_DB.prepare(
        'UPDATE ai_operations SET stopped_at = COALESCE(stopped_at, ?) WHERE id = ?',
      )
        .bind(Date.now(), operation.id)
        .run();

    const stub = conversations.get(conversations.idFromName(operation.conversation_id));

    const response = await stub.fetch(
      `https://ai.internal/${expired ? 'stop' : 'snapshot'}?operation=${encodeURIComponent(operation.id)}`,
      { method: expired ? 'POST' : 'GET', headers: { 'x-ai-user': operation.user_id } },
    );

    if (response.status === 409 && expired) {
      await settleAICalls(env, operation.id, operation.route_key);
      await env.USER_DB.prepare(
        'UPDATE ai_operations SET completed_at = COALESCE(completed_at, ?) WHERE id = ?',
      )
        .bind(Date.now(), operation.id)
        .run();
    } else if (!response.ok) throw new Error(`AI recovery HTTP ${response.status}`);
    await response.body?.cancel();
  } catch (error) {
    await env.USER_DB.prepare(`
      UPDATE usage_events
      SET recovery_after = ?
      WHERE status NOT IN ('succeeded', 'failed')
        AND EXISTS (
          SELECT 1 FROM ai_call_attempts a
          WHERE a.usage_id = usage_events.id AND a.operation_id = ?
        )
    `)
      .bind(Date.now() + AI_USAGE_RECOVERY_RETRY_DELAY_MS, operation.id)
      .run()
      .catch(() => undefined);
    throw error;
  }
};

export const recoverAIConversations = async (env: ApiEnv['Bindings']) => {
  const conversations = env.AI_CONVERSATIONS;

  if (!conversations) return;
  const now = Date.now();

  const { results } = await env.USER_DB.prepare(`
    SELECT o.id, o.user_id, o.conversation_id, o.deadline_at, c.route_key
    FROM ai_operations o JOIN ai_conversations c ON c.id = o.conversation_id
    WHERE o.submitted_at IS NOT NULL
      AND o.completed_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM ai_call_attempts a
        JOIN usage_events u ON u.id = a.usage_id
        WHERE a.operation_id = o.id AND u.recovery_after > ?
      )
    ORDER BY o.submitted_at LIMIT 100
  `)
    .bind(now)
    .all<RecoverableOperation>();
  const failures: unknown[] = [];

  for (let index = 0; index < results.length; index += RECOVERY_CONCURRENCY) {
    const settled = await Promise.allSettled(
      results
        .slice(index, index + RECOVERY_CONCURRENCY)
        .map((operation) => recoverOperation(env, conversations, operation)),
    );

    for (const result of settled) {
      if (result.status === 'rejected') failures.push(result.reason);
    }
  }

  await env.USER_DB.batch([
    env.USER_DB.prepare(`UPDATE ai_conversations SET deleted_at = ?
    WHERE expires_at <= ? AND deleted_at IS NULL AND NOT EXISTS (
      SELECT 1 FROM ai_operations o WHERE o.conversation_id = ai_conversations.id AND o.submitted_at IS NOT NULL AND o.completed_at IS NULL
    )`).bind(Date.now(), Date.now()),
    env.USER_DB.prepare(`DELETE FROM ai_conversations WHERE deleted_at < ? AND NOT EXISTS (
    SELECT 1 FROM ai_operations o WHERE o.conversation_id = ai_conversations.id AND o.submitted_at IS NOT NULL AND o.completed_at IS NULL
  )`).bind(Date.now() - AI_RETENTION_MS),
  ]);

  if (failures.length) throw new AggregateError(failures, 'AI conversation recovery failed');
};
