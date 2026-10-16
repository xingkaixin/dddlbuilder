import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  fetchAIConversation,
  observeAIOperation,
  readAIOperations,
} from '@/services/aiConversationService';
import { readTextStream } from '@/services/streamingText';

const identity = { operationId: 'op', conversationId: 'conversation', userId: 'user' };
const snapshot = (text: string, status = 'running') => ({
  ...identity,
  status,
  text,
  thinking: '',
  suggestions: [],
  result: status === 'succeeded' ? text : null,
  error: null,
  accountingPending: false,
});
const events = (...frames: ReturnType<typeof snapshot>[]) =>
  new Response(frames.map((frame) => JSON.stringify(frame) + '\n').join(''));

beforeEach(() => sessionStorage.clear());

afterEach(() => vi.restoreAllMocks());

it('prepares once and reconnects observation without resubmitting the model operation', async () => {
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(Response.json(identity))
    .mockResolvedValueOnce(Response.json(snapshot('')))
    .mockResolvedValueOnce(events(snapshot('partial')))
    .mockResolvedValueOnce(
      events(snapshot('replacement'), snapshot('replacement answer', 'succeeded')),
    );
  const response = await fetchAIConversation('explain', {
    method: 'POST',
    body: JSON.stringify({ sql: 'SELECT 1' }),
  });

  if (!response.body) throw new Error('Missing response body');
  expect(await readTextStream(response.body)).toBe('replacement answer');
  expect(fetch.mock.calls.map(([url]) => url)).toEqual([
    '/api/ai/operations',
    '/api/ai/operations/op',
    '/api/ai/operations/op/events',
    '/api/ai/operations/op/events',
  ]);
  expect(readAIOperations()).toEqual([]);
});

it('retries a transient network failure but rejects mismatched operation identities', async () => {
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockRejectedValueOnce(new TypeError('network'))
    .mockResolvedValueOnce(events(snapshot('complete', 'succeeded')));
  expect(
    (await observeAIOperation('op', new AbortController().signal, () => undefined)).status,
  ).toBe('succeeded');
  fetch.mockResolvedValue(
    events({ ...snapshot('complete', 'succeeded'), operationId: 'another-user-operation' }),
  );
  await expect(
    observeAIOperation('op', new AbortController().signal, () => undefined),
  ).rejects.toThrow('identity mismatch');
});

it.each(['stop', 'detach'])(
  'only sends a stop command for explicit cancellation: %s',
  async (reason) => {
    const controller = new AbortController();
    let listening = () => {};

    const started = new Promise<void>((resolve) => {
      listening = resolve;
    });

    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json(identity))
      .mockResolvedValueOnce(Response.json(snapshot('')))
      .mockImplementation(async (url, init) => {
        if (String(url).endsWith('/stop')) return Response.json({ stopped: true });
        listening();

        return new Promise<Response>((_resolve, reject) =>
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          ),
        );
      });
    const response = await fetchAIConversation('explain', {
      method: 'POST',
      body: '{}',
      signal: controller.signal,
    });

    if (!response.body) throw new Error('Missing response body');
    const reading = readTextStream(response.body);
    await started;
    controller.abort(reason);
    await expect(reading).rejects.toThrow('Aborted');
    expect(fetch.mock.calls.some(([url]) => String(url).endsWith('/stop'))).toBe(reason === 'stop');
    await vi.waitFor(() => expect(readAIOperations()).toHaveLength(reason === 'stop' ? 0 : 1));
  },
);
