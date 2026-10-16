import { afterEach, expect, it, vi } from 'vitest';
import { createAIRuntimeFixture as createRuntime } from '../helpers/aiRuntime.js';
import { AI_CONTEXT_LIMIT_ERROR, decodeAIConversationSnapshot } from '@ddlbuilder/shared-types';

const response = (text = 'This query reads users.', stopReason = 'end_turn') => {
  const events = [
    {
      type: 'message_start',
      message: {
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        model: 'claude-haiku-5-5',
        content: [],
        stop_reason: null,
        usage: { input_tokens: 20, output_tokens: 0 },
      },
    },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    { type: 'content_block_stop', index: 0 },
    {
      type: 'message_delta',
      delta: { stop_reason: stopReason, stop_sequence: null },
      usage: { output_tokens: 10 },
    },
    { type: 'message_stop' },
  ];

  return new Response(
    events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''),
    { headers: { 'Content-Type': 'text/event-stream' } },
  );
};

afterEach(() => vi.unstubAllGlobals());

it('runs the built-in Conversation through the real provider and settles once', async () => {
  const requests: { model: string; thinking: { type: string } }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, init) => {
      requests.push(JSON.parse(init.body));

      return response();
    }),
  );
  const test = await createRuntime();

  const submit = () =>
    test.runtime.fetch(
      new Request('https://internal/submit?operation=operation', {
        method: 'POST',
        headers: { 'x-ai-user': 'user-1', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          route: 'explain',
          input: { sql: 'SELECT * FROM users', locale: 'en-US' },
        }),
      }),
    );
  expect((await submit()).status).toBe(200);
  await test.finish();

  const snapshot = await (
    await test.runtime.fetch(
      new Request('https://internal/snapshot?operation=operation', {
        headers: { 'x-ai-user': 'user-1' },
      }),
    )
  ).json();
  expect(snapshot).toMatchObject({
    status: 'succeeded',
    text: 'This query reads users.',
    accountingPending: false,
  });
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({ model: 'claude-haiku-5-5', thinking: { type: 'disabled' } });
  expect(await test.balance()).toBe(99_970);
  await submit();
  await test.finish();
  expect(requests).toHaveLength(1);
  expect(await test.balance()).toBe(99_970);
});

const submit = (
  test: Awaited<ReturnType<typeof createRuntime>>,
  route = 'explain',
  input: { sql?: string; locale?: string; ddl?: string; tableName?: string; dbType?: string } = {
    sql: 'SELECT * FROM users',
    locale: 'en-US',
  },
) =>
  test.runtime.fetch(
    new Request('https://internal/submit?operation=operation', {
      method: 'POST',
      headers: { 'x-ai-user': 'user-1' },
      body: JSON.stringify({ route, input }),
    }),
  );
const snapshot = async (test: Awaited<ReturnType<typeof createRuntime>>, id = 'operation') =>
  decodeAIConversationSnapshot(
    await (
      await test.runtime.fetch(
        new Request(`https://internal/snapshot?operation=${id}`, {
          headers: { 'x-ai-user': 'user-1' },
        }),
      )
    ).json(),
  );

it('denies insufficient credits before dispatch and finishes without charging', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const test = await createRuntime({ balance: 1 });
  await submit(test);
  await test.finish();
  expect(fetch).not.toHaveBeenCalled();
  expect(await test.balance()).toBe(1);
  expect(await snapshot(test)).toMatchObject({
    status: 'failed',
    accountingPending: false,
    error: 'CREDIT_EXHAUSTED',
  });
});

it('bills actual usage when a completed model output fails validation', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => response('not JSON')),
  );
  const test = await createRuntime();
  await submit(test, 'review', {
    ddl: 'CREATE TABLE users(id INT)',
    tableName: 'users',
    dbType: 'mysql',
  });
  await test.finish();
  expect(await snapshot(test)).toMatchObject({
    status: 'failed',
    accountingPending: false,
    error: 'UPSTREAM_OPENAI_ERROR',
  });
  expect(await test.balance()).toBe(99_970);
});

it('reports a truncated model output and bills its usage', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => response('partial', 'max_tokens')),
  );
  const test = await createRuntime();
  await submit(test);
  await test.finish();
  expect(await snapshot(test)).toMatchObject({ status: 'failed', error: 'AI_OUTPUT_TRUNCATED' });
  expect(await test.balance()).toBe(99_970);
});

it('keeps completed conversations when a stale alarm arrives before expiry', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => response()),
  );
  const test = await createRuntime();
  await submit(test);
  await test.finish();
  await test.runtime.alarm();
  expect(test.deleted).toBe(false);
  expect(test.alarmAt).toBeGreaterThan(Date.now());
});

it('retries settlement from a saved receipt without repeating the model call', async () => {
  const fetch = vi.fn(async () => response());
  vi.stubGlobal('fetch', fetch);
  const test = await createRuntime();
  test.sqlite.exec(
    "CREATE TRIGGER fail_settlement BEFORE UPDATE OF status ON usage_events WHEN NEW.status <> 'reserved' BEGIN SELECT RAISE(ABORT, 'injected settlement failure'); END",
  );
  await submit(test);
  await expect(test.finish()).rejects.toThrow('AI operation requires durable recovery');
  test.sqlite.exec('DROP TRIGGER fail_settlement');
  await snapshot(test);
  // The recovery request starts another execution; earlier rejected promises remain in the fixture log.
  await vi.waitFor(async () =>
    expect(await snapshot(test)).toMatchObject({ accountingPending: false }),
  );
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(await test.balance()).toBe(99_970);
});

it('keeps a completed output when the receipt cannot reach D1', async () => {
  const fetch = vi.fn(async () => response());
  vi.stubGlobal('fetch', fetch);
  const test = await createRuntime();
  test.sqlite.exec(
    "CREATE TRIGGER fail_receipt BEFORE UPDATE OF observed_tokens ON ai_call_attempts WHEN NEW.observed_tokens IS NOT NULL BEGIN SELECT RAISE(ABORT, 'injected receipt failure'); END",
  );
  await submit(test);
  await expect(test.finish()).rejects.toThrow('AI operation requires durable recovery');
  test.sqlite.exec('DROP TRIGGER fail_receipt');
  await snapshot(test);
  await vi.waitFor(async () =>
    expect(await snapshot(test)).toMatchObject({
      status: 'succeeded',
      text: 'This query reads users.',
      accountingPending: false,
    }),
  );
  expect(fetch).toHaveBeenCalledOnce();
  expect(await test.balance()).toBe(99_970);
});

it('records an explicit provider rejection with zero charge and a physical attempt', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json(
        { type: 'error', error: { type: 'invalid_request_error', message: 'Invalid model' } },
        { status: 400 },
      ),
    ),
  );
  const test = await createRuntime();
  await submit(test);
  await test.finish();
  expect(await snapshot(test)).toMatchObject({
    status: 'failed',
    accountingPending: false,
    error: 'UPSTREAM_OPENAI_ERROR',
  });
  expect(await test.balance()).toBe(100_000);
  expect(
    test.sqlite.prepare('SELECT attempt_count, charged_tokens FROM usage_events').get(),
  ).toMatchObject({ attempt_count: 1, charged_tokens: 0 });
});

it.each(['stop', 'revoke', 'deadline'])(
  'interrupts active provider work after %s and never starts a new call',
  async (action) => {
    let started = () => {};

    const dispatched = new Promise<void>((resolve) => {
      started = resolve;
    });
    const fetch = vi.fn(async (_url, init: RequestInit) => {
      started();

      return new Promise<Response>((_resolve, reject) =>
        init.signal?.addEventListener(
          'abort',
          () => reject(new DOMException('Aborted', 'AbortError')),
          { once: true },
        ),
      );
    });
    vi.stubGlobal('fetch', fetch);
    const test = await createRuntime();
    await submit(test);
    await dispatched;

    if (action === 'stop')
      await test.runtime.fetch(
        new Request('https://internal/stop?operation=operation', {
          method: 'POST',
          headers: { 'x-ai-user': 'user-1' },
        }),
      );
    else {
      if (action === 'revoke') test.sqlite.prepare('DELETE FROM session').run();
      else test.sqlite.prepare('UPDATE ai_operations SET deadline_at = 1').run();
      await test.runtime.alarm();
    }

    await test.finish();
    expect(await snapshot(test)).toMatchObject({ status: 'cancelled', accountingPending: false });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await test.balance()).toBeLessThan(100_000);
  },
);

it('continues generation after an observer disconnects', async () => {
  let release = (_response: Response) => {};

  const fetch = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        release = resolve;
      }),
  );
  vi.stubGlobal('fetch', fetch);
  const test = await createRuntime();
  await submit(test);
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());

  const events = await test.runtime.fetch(
    new Request('https://internal/events?operation=operation', {
      headers: { 'x-ai-user': 'user-1' },
    }),
  );
  const reader = events.body?.getReader();
  await reader?.read();
  await reader?.cancel();
  release(response());
  await test.finish();
  expect(await snapshot(test)).toMatchObject({ status: 'succeeded', accountingPending: false });
  expect(fetch).toHaveBeenCalledOnce();
});

it('charges an explicit stop by observed input and received output', async () => {
  const encoder = new TextEncoder();

  const partial = [
    {
      type: 'message_start',
      message: {
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        model: 'claude-haiku-5-5',
        content: [],
        stop_reason: null,
        usage: { input_tokens: 20, output_tokens: 0 },
      },
    },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hi' } },
  ];
  let streamed = () => {};

  const started = new Promise<void>((resolve) => {
    streamed = resolve;
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (_url, init: RequestInit) =>
        new Response(
          new ReadableStream({
            start(controller) {
              for (const event of partial)
                controller.enqueue(
                  encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`),
                );
              init.signal?.addEventListener('abort', () =>
                controller.error(new DOMException('Aborted', 'AbortError')),
              );
              streamed();
            },
          }),
          { headers: { 'Content-Type': 'text/event-stream' } },
        ),
    ),
  );
  const test = await createRuntime();
  await submit(test);
  await started;
  await vi.waitFor(async () => expect((await snapshot(test)).text).toBe('Hi'));
  await test.runtime.fetch(
    new Request('https://internal/stop?operation=operation', {
      method: 'POST',
      headers: { 'x-ai-user': 'user-1' },
    }),
  );
  await test.finish();
  expect(await snapshot(test)).toMatchObject({ status: 'cancelled', accountingPending: false });
  expect(await test.balance()).toBe(100_000 - 20 - 'Hi'.length);
});

it('refunds a reservation when the global budget denies dispatch', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);

  const test = await createRuntime({
    bindings: { OPENAI_DAILY_BUDGET_ENABLED: 'true', OPENAI_DAILY_BUDGET_MAX_TOKENS: '1' },
  });
  await submit(test);
  await test.finish();
  expect(await snapshot(test)).toMatchObject({
    status: 'failed',
    accountingPending: false,
    error: 'SERVICE_UNAVAILABLE',
  });
  expect(fetch).not.toHaveBeenCalled();
  expect(await test.balance()).toBe(100_000);
});

it('keeps conversation history across rounds and serves prior completed operations', async () => {
  const payloads: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, init: RequestInit) => {
      payloads.push(String(init.body));

      return response(payloads.length === 1 ? 'First answer' : 'Second answer');
    }),
  );
  const test = await createRuntime();
  await submit(test);
  await test.finish();
  test.sqlite
    .prepare(
      "INSERT INTO ai_operations(id,conversation_id,user_id,session_id,submitted_at,deadline_at,created_at) VALUES('second','conversation','user-1','session',1,?,2)",
    )
    .run(Date.now() + 600_000);
  await test.runtime.fetch(
    new Request('https://internal/submit?operation=second', {
      method: 'POST',
      headers: { 'x-ai-user': 'user-1' },
      body: JSON.stringify({ route: 'explain', input: { sql: 'SELECT 2' } }),
    }),
  );
  await test.finish();
  expect(payloads).toHaveLength(2);
  expect(payloads[1]).toContain('First answer');
  expect(payloads[1]).toContain('SELECT 2');
  expect(await snapshot(test)).toMatchObject({ status: 'succeeded', text: 'First answer' });
  expect(await test.balance()).toBe(99_940);
});

it('scopes persisted review suggestions to their own operation', async () => {
  const payloads: string[] = [];

  const review = (id: string) =>
    JSON.stringify({
      score: 80,
      summary: 'Review',
      suggestions: [{ id, type: 'general', description: `Advice ${id}`, actionable: false }],
    });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, init: RequestInit) => {
      payloads.push(String(init.body));

      return response(review(payloads.length === 1 ? 'first' : 'second'));
    }),
  );
  const test = await createRuntime();
  const input = { ddl: 'CREATE TABLE users(id INT)', tableName: 'users', dbType: 'mysql' };
  await submit(test, 'review', input);
  await test.finish();
  test.sqlite
    .prepare(
      "INSERT INTO ai_operations(id,conversation_id,user_id,session_id,submitted_at,deadline_at,created_at) VALUES('second','conversation','user-1','session',1,?,2)",
    )
    .run(Date.now() + 600_000);

  const accepted = await test.runtime.fetch(
    new Request('https://internal/submit?operation=second', {
      method: 'POST',
      headers: { 'x-ai-user': 'user-1' },
      body: JSON.stringify({ route: 'review', input: { ...input, locale: 'en-US' } }),
    }),
  );
  expect(decodeAIConversationSnapshot(await accepted.json()).suggestions).toEqual([]);
  await test.finish();
  expect(payloads[1]).not.toContain('Persisted review suggestions');
  const current = await snapshot(test, 'second');
  expect(current.suggestions).toEqual([expect.objectContaining({ id: 'second' })]);
});

it('reports the conversation context limit without dispatching another call', async () => {
  const fetch = vi.fn(async () => response('x'.repeat(125_000)));
  vi.stubGlobal('fetch', fetch);
  const test = await createRuntime();
  await submit(test);
  await test.finish();
  test.sqlite
    .prepare(
      "INSERT INTO ai_operations(id,conversation_id,user_id,session_id,submitted_at,deadline_at,created_at) VALUES('second','conversation','user-1','session',1,?,2)",
    )
    .run(Date.now() + 600_000);
  await test.runtime.fetch(
    new Request('https://internal/submit?operation=second', {
      method: 'POST',
      headers: { 'x-ai-user': 'user-1' },
      body: JSON.stringify({ route: 'explain', input: { sql: 'SELECT 2' } }),
    }),
  );
  await test.finish();
  const current = await snapshot(test, 'second');
  expect(current).toMatchObject({ status: 'failed', error: AI_CONTEXT_LIMIT_ERROR });
  expect(fetch).toHaveBeenCalledOnce();
});

const addOperation = (test: Awaited<ReturnType<typeof createRuntime>>, id: string) =>
  test.sqlite
    .prepare(
      "INSERT INTO ai_operations(id,conversation_id,user_id,session_id,submitted_at,deadline_at,created_at) VALUES(?,'conversation','user-1','session',1,?,2)",
    )
    .run(id, Date.now() + 600_000);

const submitOperation = (test: Awaited<ReturnType<typeof createRuntime>>, id: string) =>
  test.runtime.fetch(
    new Request(`https://internal/submit?operation=${id}`, {
      method: 'POST',
      headers: { 'x-ai-user': 'user-1' },
      body: JSON.stringify({ route: 'explain', input: { sql: 'SELECT 2' } }),
    }),
  );

it('settles a stopped round before accepting the next operation', async () => {
  const fetch = vi.fn(
    (_url: string, init: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        if (fetch.mock.calls.length > 1) resolve(response());
        init.signal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        );
      }),
  );
  vi.stubGlobal('fetch', fetch);
  const test = await createRuntime();
  await submit(test);
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  addOperation(test, 'second');
  expect((await submitOperation(test, 'second')).status).toBe(409);
  test.sqlite.prepare("UPDATE ai_operations SET stopped_at = 1 WHERE id = 'operation'").run();
  expect((await submitOperation(test, 'second')).status).toBe(200);
  await test.finish();
  expect(await snapshot(test)).toMatchObject({ status: 'cancelled', accountingPending: false });
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('accepts only one of two concurrent operations', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => response()),
  );
  const test = await createRuntime();
  addOperation(test, 'second');

  const statuses = await Promise.all([submit(test), submitOperation(test, 'second')]).then(
    (responses) => responses.map((item) => item.status).sort((a, b) => a - b),
  );
  await test.finish();
  expect(statuses).toEqual([200, 409]);
});
