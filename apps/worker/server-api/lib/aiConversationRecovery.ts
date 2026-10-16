import type { ApiEnv } from './context.js';
import { AI_RETENTION_MS } from './aiConversationConfig.js';
import { settleAICalls } from './aiConversationUsage.js';
import type { AIRouteKey } from './aiRouteKey.js';

export const recoverAIConversations = async (env: ApiEnv['Bindings']) => {
  if (!env.AI_CONVERSATIONS) return;

  const { results } =
    await env.USER_DB.prepare(`SELECT o.id, o.user_id, o.conversation_id, o.deadline_at, c.route_key
    FROM ai_operations o JOIN ai_conversations c ON c.id = o.conversation_id
    WHERE o.submitted_at IS NOT NULL AND o.completed_at IS NULL ORDER BY o.submitted_at LIMIT 100`).all<{
      id: string;
      user_id: string;
      conversation_id: string;
      deadline_at: number;
      route_key: AIRouteKey;
    }>();
  const failures: unknown[] = [];

  for (const operation of results) {
    try {
      const expired = operation.deadline_at <= Date.now();

      if (expired)
        await env.USER_DB.prepare(
          'UPDATE ai_operations SET stopped_at = COALESCE(stopped_at, ?) WHERE id = ?',
        )
          .bind(Date.now(), operation.id)
          .run();

      const stub = env.AI_CONVERSATIONS.get(
        env.AI_CONVERSATIONS.idFromName(operation.conversation_id),
      );
      const response = await stub.fetch(
        `https://ai.internal/${expired ? 'stop' : 'snapshot'}?operation=${encodeURIComponent(operation.id)}`,
        { method: expired ? 'POST' : 'GET', headers: { 'x-ai-user': operation.user_id } },
      );

      if (response.status === 409 && expired) {
        await settleAICalls(env, operation.id, operation.route_key);
        await env.USER_DB.prepare('UPDATE ai_operations SET completed_at = ? WHERE id = ?')
          .bind(Date.now(), operation.id)
          .run();
      } else if (!response.ok) throw new Error(`AI recovery HTTP ${response.status}`);
      await response.body?.cancel();
    } catch (error) {
      failures.push(error);
    }
  }

  await env.USER_DB.prepare(`UPDATE ai_conversations SET deleted_at = ?
    WHERE expires_at <= ? AND deleted_at IS NULL AND NOT EXISTS (
      SELECT 1 FROM ai_operations o WHERE o.conversation_id = ai_conversations.id AND o.submitted_at IS NOT NULL AND o.completed_at IS NULL
    )`)
    .bind(Date.now(), Date.now())
    .run();
  await env.USER_DB.prepare(`DELETE FROM ai_conversations WHERE deleted_at < ? AND NOT EXISTS (
    SELECT 1 FROM ai_operations o WHERE o.conversation_id = ai_conversations.id AND o.submitted_at IS NOT NULL AND o.completed_at IS NULL
  )`)
    .bind(Date.now() - AI_RETENTION_MS)
    .run();

  if (failures.length) throw new AggregateError(failures, 'AI conversation recovery failed');
};
