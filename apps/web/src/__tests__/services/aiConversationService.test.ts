import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  fetchAIConversation,
  hasResumableAIOperation,
  observeAIOperation,
  resumeAIConversation,
} from '@/services/aiConversationService';
import { readTextStream } from '@/services/streamingText';
import i18n from '@/i18n';

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
});

it.each(['explain', 'generate-comments'] as const)(
  'shows the localized reason when an operation fails: %s',
  async (route) => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json(identity))
      .mockResolvedValueOnce(Response.json(snapshot('')))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ...snapshot('', 'failed'), error: 'CREDIT_EXHAUSTED' }) + '\n',
        ),
      );

    const reading = fetchAIConversation(route, { method: 'POST', body: '{}' }).then((response) => {
      if (!response.body) throw new Error('Missing response body');

      return readTextStream(response.body);
    });

    await expect(reading).rejects.toThrow(i18n.t('services.creditExhausted'));
  },
);

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

const hangUntilAborted =
  (onListen: () => void) => async (url: RequestInfo | URL, init?: RequestInit) => {
    if (String(url).endsWith('/stop')) return Response.json({ stopped: true });
    onListen();

    return new Promise<Response>((_resolve, reject) =>
      init?.signal?.addEventListener(
        'abort',
        () => reject(new DOMException('Aborted', 'AbortError')),
        { once: true },
      ),
    );
  };

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
      .mockImplementation(hangUntilAborted(listening));
    const response = await fetchAIConversation(
      'review',
      { method: 'POST', body: '{}', signal: controller.signal },
      { resumeKey: 'review' },
    );

    if (!response.body) throw new Error('Missing response body');
    const reading = readTextStream(response.body);
    await started;
    controller.abort(reason);
    await expect(reading).rejects.toThrow('Aborted');
    expect(fetch.mock.calls.some(([url]) => String(url).endsWith('/stop'))).toBe(reason === 'stop');
    await vi.waitFor(() => expect(hasResumableAIOperation('review')).toBe(reason === 'detach'));
  },
);

it('still submits an operation detached mid-submit so it can be resumed', async () => {
  const controller = new AbortController();
  let submit = (_response: Response) => {};

  let submitSignal: AbortSignal | null | undefined;

  vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(Response.json(identity))
    .mockImplementationOnce((_url, init) => {
      submitSignal = init?.signal;

      return new Promise<Response>((resolve) => {
        submit = resolve;
      });
    });

  const request = fetchAIConversation(
    'review',
    { method: 'POST', body: '{}', signal: controller.signal },
    { resumeKey: 'review' },
  );
  await vi.waitFor(() => expect(submitSignal).toBeDefined());
  controller.abort('detach');
  expect(submitSignal?.aborted).toBe(false);
  submit(Response.json(snapshot('')));
  await expect(request).rejects.toBe('detach');
  expect(hasResumableAIOperation('review')).toBe(true);
});

it('resumes a detached operation from its events without submitting it again', async () => {
  const controller = new AbortController();
  let listening = () => {};

  const started = new Promise<void>((resolve) => {
    listening = resolve;
  });

  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(Response.json(identity))
    .mockResolvedValueOnce(Response.json(snapshot('')))
    .mockImplementationOnce(hangUntilAborted(listening))
    .mockResolvedValueOnce(events(snapshot('complete', 'succeeded')));
  const response = await fetchAIConversation(
    'review',
    { method: 'POST', body: '{}', signal: controller.signal },
    { resumeKey: 'review' },
  );

  if (!response.body) throw new Error('Missing response body');
  const reading = readTextStream(response.body);
  await started;
  controller.abort('detach');
  await expect(reading).rejects.toThrow('Aborted');

  const resumed = resumeAIConversation('review', new AbortController().signal);

  if (!resumed?.body) throw new Error('Missing resumed body');
  expect(await readTextStream(resumed.body)).toBe('complete');
  expect(fetch.mock.calls.map(([url]) => url)).toEqual([
    '/api/ai/operations',
    '/api/ai/operations/op',
    '/api/ai/operations/op/events',
    '/api/ai/operations/op/events',
  ]);
  expect(hasResumableAIOperation('review')).toBe(false);
});
