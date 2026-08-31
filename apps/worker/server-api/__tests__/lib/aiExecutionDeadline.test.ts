import { afterEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { ApiEnv } from '../../lib/context.js';
import { withAIGovernance } from '../../lib/aiRoute.js';
import { applyCreditMutation } from '../../lib/credits.js';
import { reclaimStaleAIUsage } from '../../lib/aiUsage.js';
import { createSqliteD1Database } from '../helpers/sqliteD1.js';

vi.mock('../../lib/auth.js', () => ({
  authenticateRequest: async () => ({ userId: 'deadline-user', email: 'deadline@example.com' }),
}));

const databases: Array<ReturnType<typeof createSqliteD1Database>['sqlite']> = [];
const encoder = new TextEncoder();

const startRequest = async (streaming = true) => {
  const { database, sqlite } = createSqliteD1Database({ includeMeta: true });
  databases.push(sqlite);
  const env = {
    USER_DB: database,
    OPENAI_API_KEY: 'test-key',
    OPENAI_REQUEST_TIMEOUT_MS: '40',
    OPENAI_RETRY_MAX_ATTEMPTS: '1',
    OPENAI_RATELIMIT_ENABLED: 'false',
  } as ApiEnv['Bindings'];
  sqlite
    .prepare('INSERT INTO user (id, name, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run('deadline-user', 'User', 'deadline@example.com', 1, 1);
  await applyCreditMutation(env, {
    userId: 'deadline-user',
    kind: 'grant',
    source: 'signup_bonus',
    amount: 1000,
    idempotencyKey: 'signup_bonus:deadline-user',
  });
  const background: Promise<unknown>[] = [];
  const app = new Hono<ApiEnv>();
  app.post('/test', (c) =>
    withAIGovernance(
      c,
      {
        route: 'explain',
        maxOutputTokens: 100,
        bodyMaxBytes: 1024,
        parseRequest: (body) => body,
        buildMessages: () => [{ role: 'user', content: 'Explain this table' }],
      },
      async (session) =>
        streaming
          ? session.streamCompletion({ scope: 'deadline-test', temperature: 0, debugInput: {} })
          : c.json(await session.completeJson({ scope: 'deadline-test', temperature: 0 })),
    ),
  );
  const response = await app.fetch(
    new Request('http://localhost/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }),
    env,
    { waitUntil: (task) => background.push(task), passThroughOnException() {}, props: {} },
  );
  return { response, sqlite, background, env };
};

const mockUpstream = (chunks: unknown[], complete = false) => {
  let signal: AbortSignal | undefined;
  const fetch = vi.fn(async (_url: unknown, init: RequestInit) => {
    signal = init.signal ?? undefined;
    return new Response(
      new ReadableStream({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
          }
          if (complete) {
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          } else {
            signal?.addEventListener(
              'abort',
              () => controller.error(new DOMException('Aborted', 'AbortError')),
              { once: true },
            );
          }
        },
      }),
      { headers: { 'content-type': 'text/event-stream' } },
    );
  });
  vi.stubGlobal('fetch', fetch);
  return { fetch, signal: () => signal };
};

const readUsage = (sqlite: ReturnType<typeof createSqliteD1Database>['sqlite']) =>
  sqlite
    .prepare('SELECT status, attempt_count, charged_tokens, estimated_tokens FROM usage_events')
    .get();

describe('AI execution deadline with the real OpenAI stream reader', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    for (const sqlite of databases.splice(0)) sqlite.close();
  });

  it('fails a stream that stops before final usage, before recovery can claim it', async () => {
    vi.useFakeTimers();
    const upstream = mockUpstream([
      { choices: [{ delta: { content: 'Complete text' }, finish_reason: 'stop' }] },
    ]);
    const { response, sqlite, background, env } = await startRequest();
    const body = response.text();
    await vi.advanceTimersByTimeAsync(40);
    const events = (await body)
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    await Promise.all(background);

    expect(upstream.signal()?.aborted).toBe(true);
    expect(upstream.fetch).toHaveBeenCalledOnce();
    expect(events.at(-1)).toMatchObject({ type: 'error', code: 'UPSTREAM_OPENAI_ERROR' });
    expect(events.some((event) => event.type === 'done')).toBe(false);
    const usage = readUsage(sqlite);
    expect(usage).toMatchObject({ status: 'failed', attempt_count: 1 });
    expect(usage?.charged_tokens).toBe(usage?.estimated_tokens);
    expect(await reclaimStaleAIUsage(env, { now: Date.now() + 16 * 60_000 })).toEqual({
      scanned: 0,
      reclaimed: 0,
      failures: [],
    });
  });

  it('settles a timed-out stream even while the client is not reading', async () => {
    vi.useFakeTimers();
    mockUpstream([
      { choices: [{ delta: { content: 'First' } }] },
      { choices: [{ delta: { content: 'Second' } }] },
    ]);
    const { response, sqlite, background } = await startRequest();
    await vi.advanceTimersByTimeAsync(40);

    expect(readUsage(sqlite)).toMatchObject({ status: 'failed', attempt_count: 1 });
    const body = await response.text();
    await Promise.all(background);
    expect(body).toContain('"type":"error"');
    expect(body).not.toContain('"type":"done"');
  });

  it('clears the deadline after a complete stream and charges measured usage', async () => {
    vi.useFakeTimers();
    const upstream = mockUpstream(
      [
        { choices: [{ delta: { content: 'Complete text' }, finish_reason: 'stop' }] },
        { choices: [], usage: { prompt_tokens: 15, completion_tokens: 5, total_tokens: 20 } },
      ],
      true,
    );
    const { response, sqlite, background } = await startRequest();
    expect(await response.text()).toContain('"type":"done"');
    await Promise.all(background);
    await vi.advanceTimersByTimeAsync(100);

    expect(upstream.signal()?.aborted).toBe(false);
    expect(readUsage(sqlite)).toMatchObject({ status: 'succeeded', charged_tokens: 20 });
    expect(sqlite.prepare('SELECT balance FROM credit_accounts').get()?.balance).toBe(980);
  });

  it('settles a non-streaming body timeout as an upstream failure', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(
      async (_url: unknown, init: RequestInit) =>
        new Response(
          new ReadableStream({
            start(controller) {
              init.signal?.addEventListener(
                'abort',
                () => controller.error(new DOMException('Aborted', 'AbortError')),
                { once: true },
              );
            },
          }),
          { headers: { 'content-type': 'application/json' } },
        ),
    );
    vi.stubGlobal('fetch', fetch);
    const pending = startRequest(false);
    await vi.advanceTimersByTimeAsync(40);
    const { response, sqlite, background } = await pending;
    await Promise.all(background);

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ code: 'UPSTREAM_OPENAI_ERROR' });
    expect(fetch).toHaveBeenCalledOnce();
    expect(readUsage(sqlite)).toMatchObject({ status: 'failed', attempt_count: 1 });
  });
});
