import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { Miniflare, Response, convertV4MiniflareOptions } from 'miniflare';
import { decodeAIConversationSnapshot } from '../packages/shared-types/src/aiConversation.js';

let calls = 0;
const worker = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    scriptPath: 'apps/worker/dist/server.js',
    compatibilityDate: '2026-03-17',
    compatibilityFlags: ['nodejs_compat'],
    durableObjects: {
      AI_CONVERSATIONS: { className: 'AIConversationDurableObject', useSQLite: true },
      WORKSPACE_YDOC: { className: 'WorkspaceYDocDurableObject', useSQLite: true },
    },
    d1Databases: ['USER_DB'],
    bindings: { ANTHROPIC_API_KEY: 'platform-test-key', ENVIRONMENT: 'test' },
    outboundService: async (request) => {
      assert.equal(new URL(request.url).hostname, 'api.anthropic.com');
      const body = await request.json();
      assert.partialDeepStrictEqual(body, {
        model: 'claude-haiku-5-5',
        thinking: { type: 'disabled' },
      });
      calls++;

      const events = [
        {
          type: 'message_start',
          message: {
            id: 'msg',
            type: 'message',
            role: 'assistant',
            model: 'claude-haiku-5-5',
            content: [],
            stop_reason: null,
            usage: { input_tokens: 20, output_tokens: 0 },
          },
        },
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'Workerd conversation completed.' },
        },
        { type: 'content_block_stop', index: 0 },
        { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 10 } },
        { type: 'message_stop' },
      ];

      return new Response(
        events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''),
        { headers: { 'Content-Type': 'text/event-stream' } },
      );
    },
  }),
);

try {
  const database = await worker.getD1Database('USER_DB');

  for (const filename of readdirSync('packages/db/migrations')
    .filter((name) => name.endsWith('.sql'))
    .sort())
    await database.exec(
      readFileSync(`packages/db/migrations/${filename}`, 'utf8')
        .replace(/^\s*--.*$/gm, '')
        .replace(/\n/g, ' '),
    );
  await database.exec(
    "INSERT INTO user(id,name,email,created_at,updated_at) VALUES('user','Test','ai@test.local',1,1); INSERT INTO credit_accounts(user_id,balance,version) VALUES('user',0,0); INSERT INTO credit_ledger(id,user_id,kind,source,amount,balance_after,idempotency_key) VALUES('grant','user','grant','signup_bonus',100000,100000,'grant');",
  );
  await database
    .prepare(
      "INSERT INTO session(id,token,user_id,expires_at,created_at,updated_at) VALUES('session','token','user',?,1,1)",
    )
    .bind(Date.now() + 600_000)
    .run();
  await database
    .prepare(
      "INSERT INTO ai_conversations(id,user_id,route_key,created_at,expires_at) VALUES('conversation','user','explain',1,?)",
    )
    .bind(Date.now() + 600_000)
    .run();
  await database
    .prepare(
      "INSERT INTO ai_operations(id,conversation_id,user_id,session_id,submitted_at,deadline_at,created_at) VALUES('operation','conversation','user','session',1,?,1)",
    )
    .bind(Date.now() + 600_000)
    .run();
  const namespace = await worker.getDurableObjectNamespace('AI_CONVERSATIONS');
  const stub = namespace.get(namespace.idFromName('conversation'));

  const submit = () =>
    stub.fetch('https://internal/submit?operation=operation', {
      method: 'POST',
      headers: { 'x-ai-user': 'user' },
      body: JSON.stringify({ route: 'explain', input: { sql: 'SELECT 1' } }),
    });
  assert.equal((await submit()).status, 200);
  let snapshot;

  for (let count = 0; count < 100; count++) {
    snapshot = decodeAIConversationSnapshot(
      await (
        await stub.fetch('https://internal/snapshot?operation=operation', {
          headers: { 'x-ai-user': 'user' },
        })
      ).json(),
    );

    if (snapshot.status !== 'running' && !snapshot.accountingPending) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  assert.equal(snapshot?.status, 'succeeded');
  assert.equal(snapshot?.text, 'Workerd conversation completed.');
  assert.equal(snapshot?.accountingPending, false);
  assert.equal(
    (await database.prepare("SELECT balance FROM credit_accounts WHERE user_id = 'user'").first())
      ?.balance,
    99_970,
  );
  await submit();
  assert.equal(calls, 1);
  console.log('Workerd AI Conversation, D1 settlement and submission replay verified.');
} finally {
  await worker.dispose();
}
