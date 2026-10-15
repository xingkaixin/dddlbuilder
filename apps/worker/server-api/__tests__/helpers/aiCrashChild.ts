import { decodeAIConversationSnapshot } from '@ddlbuilder/shared-types';
import type { JsonObject } from '@earendil-works/pi-ai';
import { createAIRuntimeFixture } from './aiRuntime.js';

const [directory, mode, scenario = 'explain'] = process.argv.slice(2);

if (!directory || !mode) throw new Error('directory and mode required');

const encoder = new TextEncoder();
const suggestion = {
  id: 'stable-review-card',
  type: 'general',
  description: 'Persisted review advice',
  actionable: false,
};
const reviewText = JSON.stringify({
  score: 8,
  summary: 'Recovered review',
  suggestions: [suggestion],
});
let suppliedProjection = false;
const event = (type: string, data: JsonObject) =>
  encoder.encode(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);

globalThis.fetch = async (_input, init) => {
  suppliedProjection = String(init?.body).includes('stable-review-card');

  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(
          event('message_start', {
            message: {
              id: 'msg',
              type: 'message',
              role: 'assistant',
              model: 'claude-haiku-5-5',
              content: [],
              stop_reason: null,
              usage: { input_tokens: 20, output_tokens: 0 },
            },
          }),
        );
        controller.enqueue(
          event('content_block_start', { index: 0, content_block: { type: 'text', text: '' } }),
        );
        controller.enqueue(
          event('content_block_delta', {
            index: 0,
            delta: {
              type: 'text_delta',
              text:
                scenario === 'review'
                  ? mode === 'crash'
                    ? `{"suggestions":[${JSON.stringify(suggestion)},{"id":`
                    : reviewText
                  : mode === 'crash'
                    ? 'Interrupted draft'
                    : 'Recovered answer',
            },
          }),
        );

        if (mode === 'crash') {
          init?.signal?.addEventListener(
            'abort',
            () => controller.error(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        } else {
          controller.enqueue(event('content_block_stop', { index: 0 }));
          controller.enqueue(
            event('message_delta', {
              delta: { stop_reason: 'end_turn' },
              usage: { output_tokens: 10 },
            }),
          );
          controller.enqueue(event('message_stop', {}));
          controller.close();
        }
      },
    }),
    { headers: { 'Content-Type': 'text/event-stream' } },
  );
};

const fixture = await createAIRuntimeFixture({ directory });
const request = () =>
  new Request('https://internal/snapshot?operation=operation', {
    headers: { 'x-ai-user': 'user-1' },
  });

if (mode === 'crash') {
  await fixture.runtime.fetch(
    new Request('https://internal/submit?operation=operation', {
      method: 'POST',
      headers: { 'x-ai-user': 'user-1' },
      body: JSON.stringify(
        scenario === 'review'
          ? {
              route: 'review',
              input: { ddl: 'CREATE TABLE users(id INT)', tableName: 'users', dbType: 'mysql' },
            }
          : { route: 'explain', input: { sql: 'SELECT 1' } },
      ),
    }),
  );

  const timer = setInterval(async () => {
    const snapshot = decodeAIConversationSnapshot(
      await (await fixture.runtime.fetch(request())).json(),
    );

    if (scenario === 'review' ? snapshot.suggestions.length > 0 : snapshot.text) {
      clearInterval(timer);
      process.send?.({ type: 'partial' });
    }
  }, 20);
} else {
  await fixture.runtime.fetch(request());
  await fixture.finish();

  const snapshot = decodeAIConversationSnapshot(
    await (await fixture.runtime.fetch(request())).json(),
  );
  process.send?.({
    type: 'completed',
    suppliedProjection,
    snapshot,
    calls: fixture.sqlite.prepare('SELECT COUNT(*) AS count FROM ai_call_attempts').get(),
    balance: await fixture.balance(),
  });
  process.exit(0);
}
