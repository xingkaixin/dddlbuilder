import { describe, expect, it } from 'vitest';
import * as Effect from 'effect/Effect';
import { createCreditFixture } from '../helpers/creditFixture.js';
import { admitAICall, recordAICallUsage, settleAICalls } from '../../lib/aiConversationUsage.js';
import { loadAIConversationConfig } from '../../lib/aiConversationConfig.js';

const estimate = { inputTokens: 40, maxOutputTokens: 60 };

const fixture = async () => {
  const test = await createCreditFixture(1000);
  test.sqlite
    .prepare(
      "INSERT INTO session (id, user_id, token, expires_at, created_at, updated_at) VALUES ('session-1', 'user-1', 'token', ?, 1, 1)",
    )
    .run(Date.now() + 600_000);
  test.sqlite
    .prepare(
      "INSERT INTO ai_conversations (id, user_id, route_key, created_at, expires_at) VALUES ('conversation-1', 'user-1', 'explain', 1, ?)",
    )
    .run(Date.now() + 600_000);
  test.sqlite
    .prepare(
      "INSERT INTO ai_operations (id, conversation_id, user_id, session_id, submitted_at, deadline_at, created_at) VALUES ('operation-1', 'conversation-1', 'user-1', 'session-1', 1, ?, 1)",
    )
    .run(Date.now() + 600_000);

  return test;
};

describe('durable AI accounting', () => {
  it('defaults thinking to off and enables it only through configuration', async () => {
    const { env } = await fixture();
    expect((await Effect.runPromise(loadAIConversationConfig(env))).thinking).toBe(false);
    expect(
      (await Effect.runPromise(loadAIConversationConfig({ ...env, AI_THINKING_ENABLED: 'true' })))
        .thinking,
    ).toBe(true);
  });

  it('charges each physical call once across settlement replay', async () => {
    const test = await fixture();
    const first = await admitAICall(
      test.env,
      'operation-1',
      'explain',
      'claude-haiku-5-5',
      estimate,
    );
    await recordAICallUsage(test.env, first, 30, 50);
    const second = await admitAICall(
      test.env,
      'operation-1',
      'explain',
      'claude-haiku-5-5',
      estimate,
    );
    await recordAICallUsage(test.env, second, 40, 60);
    await settleAICalls(test.env, 'operation-1', 'explain');
    await settleAICalls(test.env, 'operation-1', 'explain');
    expect(await test.balance()).toBe(930);
    await expect(
      admitAICall(test.env, 'operation-1', 'explain', 'claude-haiku-5-5', estimate),
    ).rejects.toThrow('limit');
  });

  it('accounts an interrupted dispatch conservatively before recovery', async () => {
    const test = await fixture();
    await admitAICall(test.env, 'operation-1', 'explain', 'claude-haiku-5-5', estimate);
    const second = await admitAICall(
      test.env,
      'operation-1',
      'explain',
      'claude-haiku-5-5',
      estimate,
    );
    await recordAICallUsage(test.env, second, 25, 30);
    await settleAICalls(test.env, 'operation-1', 'explain');
    expect(await test.balance()).toBe(875);
  });

  it('charges stopped calls by observed input and received output', async () => {
    const test = await fixture();
    const started = await admitAICall(
      test.env,
      'operation-1',
      'explain',
      'claude-haiku-5-5',
      estimate,
    );
    await recordAICallUsage(test.env, started, 20, 5, {
      complete: false,
      succeeded: false,
      inputTokens: 20,
      outputTokens: 0,
    });
    const unanswered = await admitAICall(
      test.env,
      'operation-1',
      'explain',
      'claude-haiku-5-5',
      estimate,
    );
    await recordAICallUsage(test.env, unanswered, 0, 0, {
      complete: false,
      succeeded: false,
      inputTokens: 0,
      outputTokens: 0,
    });
    await settleAICalls(test.env, 'operation-1', 'explain', false);
    expect(await test.balance()).toBe(1000 - (20 + 5) - 40);
  });

  it('denies stopped or revoked operations before reserving another call', async () => {
    const test = await fixture();
    test.sqlite.prepare("UPDATE ai_operations SET stopped_at = 1 WHERE id = 'operation-1'").run();
    await expect(
      admitAICall(test.env, 'operation-1', 'explain', 'claude-haiku-5-5', estimate),
    ).rejects.toThrow('stopped');
    expect(await test.balance()).toBe(1000);
    test.sqlite
      .prepare("UPDATE ai_operations SET stopped_at = NULL WHERE id = 'operation-1'")
      .run();
    test.sqlite.prepare('DELETE FROM session').run();
    await expect(
      admitAICall(test.env, 'operation-1', 'explain', 'claude-haiku-5-5', estimate),
    ).rejects.toThrow('authorization');
  });
});
