import type { AIStreamEvent } from '@ddlbuilder/shared-types';
import * as Schema from 'effect/Schema';
import {
  AIOperationIdentitySchema,
  AIConversationSnapshotSchema,
  type AIConversationRoute,
  type AIConversationSnapshot,
} from '@ddlbuilder/shared-types';
import { buildAuthenticatedJsonHeaders, readAIErrorMessage } from './aiApi';

const STORAGE_KEY = 'ddlbuilder.ai.operations';
const StoredOperations = Schema.Array(
  Schema.Struct({
    operationId: Schema.String,
    conversationId: Schema.String,
    userId: Schema.String,
    route: Schema.String,
  }),
);
export const readAIOperations = () => {
  try {
    return Schema.decodeUnknownSync(StoredOperations)(
      JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '[]'),
    );
  } catch {
    return [];
  }
};
const announce = () => window.dispatchEvent(new Event('ai-operations-changed'));
export const forgetAIOperation = (id: string) => {
  sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(readAIOperations().filter((item) => item.operationId !== id)),
  );
  announce();
};
export const readAIOperationSnapshot = async (id: string, signal?: AbortSignal) => {
  const response = await fetch(`/api/ai/operations/${encodeURIComponent(id)}`, {
    credentials: 'include',
    signal,
  });

  if (!response.ok) throw new Error(await readAIErrorMessage(response, 'generationFailed'));

  return Schema.decodeUnknownSync(AIConversationSnapshotSchema)(await response.json());
};
export const stopAIOperation = async (id: string) => {
  const response = await fetch(`/api/ai/operations/${encodeURIComponent(id)}/stop`, {
    method: 'POST',
    headers: buildAuthenticatedJsonHeaders(),
    credentials: 'include',
  });

  if (!response.ok) throw new Error(await readAIErrorMessage(response, 'generationFailed'));
  announce();
};

export const observeAIOperation = async (
  id: string,
  signal: AbortSignal,
  update: (snapshot: AIConversationSnapshot) => void,
) => {
  for (let reconnect = 0; reconnect < 3; reconnect++) {
    signal.throwIfAborted();

    try {
      const response = await fetch(`/api/ai/operations/${encodeURIComponent(id)}/events`, {
        credentials: 'include',
        signal,
      });

      if (!response.ok) throw new Error(await readAIErrorMessage(response, 'generationFailed'));

      if (!response.body) throw new Error('AI response stream missing');
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) break;
          buffer += value;
          let newline: number;

          while ((newline = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, newline);
            buffer = buffer.slice(newline + 1);

            const snapshot = Schema.decodeUnknownSync(AIConversationSnapshotSchema)(
              JSON.parse(line),
            );

            if (snapshot.operationId !== id) throw new Error('AI operation identity mismatch');
            update(snapshot);

            if (snapshot.status !== 'running' && snapshot.status !== 'prepared') return snapshot;
          }
        }
      } finally {
        await reader.cancel().catch(() => undefined);
      }
    } catch (error) {
      if (signal.aborted || !(error instanceof TypeError) || reconnect === 2) throw error;
    }

    await new Promise((resolve) => setTimeout(resolve, 100 * (reconnect + 1)));
  }

  throw new Error('AI connection interrupted. Reopen the operation to continue.');
};

export const fetchAIConversation = async (
  route: AIConversationRoute,
  init: RequestInit,
  conversationId?: string,
): Promise<Response> => {
  const signal = init.signal ?? new AbortController().signal;

  const prepared = await fetch('/api/ai/operations', {
    method: 'POST',
    headers: buildAuthenticatedJsonHeaders(),
    credentials: 'include',
    signal,
    body: JSON.stringify({ route, conversationId }),
  });

  if (!prepared.ok) return prepared;
  const identity = Schema.decodeUnknownSync(AIOperationIdentitySchema)(await prepared.json());
  sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify([...readAIOperations(), { ...identity, route }].slice(-20)),
  );
  announce();

  const stop = () => {
    if (signal.reason === 'stop' || signal.reason === 'superseded') {
      stopAIOperation(identity.operationId).catch(() => announce());
    }
  };
  signal.addEventListener('abort', stop, { once: true });

  if (signal.aborted) {
    stop();
    signal.throwIfAborted();
  }

  const submitted = await fetch(`/api/ai/operations/${identity.operationId}`, {
    ...init,
    signal,
    credentials: 'include',
  }).catch((error) => {
    signal.removeEventListener('abort', stop);
    throw error;
  });

  if (!submitted.ok) {
    signal.removeEventListener('abort', stop);

    return submitted;
  }

  await submitted.body?.cancel();
  const encoder = new TextEncoder();
  const streaming = route === 'explain' || route === 'review' || route === 'generate-table';

  if (!streaming) {
    try {
      const result = await observeAIOperation(identity.operationId, signal, () => undefined);

      if (result.status !== 'succeeded') throw new Error(result.error ?? 'AI generation failed');

      return Response.json(result.result, {
        headers: { 'X-AI-Conversation': identity.conversationId },
      });
    } finally {
      signal.removeEventListener('abort', stop);
      announce();
    }
  }

  let cancelled = false;

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: AIStreamEvent) => {
        if (!cancelled) controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
      };

      let text = '';
      let thinking = '';
      let suggestions = '';
      observeAIOperation(identity.operationId, signal, (snapshot) => {
        const nextSuggestions = JSON.stringify(snapshot.suggestions);

        if (suggestions !== nextSuggestions) {
          suggestions = nextSuggestions;
          send({ type: 'suggestions', suggestions: snapshot.suggestions });
        }

        if (snapshot.text !== text) {
          send(
            snapshot.text.startsWith(text)
              ? { type: 'delta', text: snapshot.text.slice(text.length) }
              : { type: 'reset', text: snapshot.text },
          );
          text = snapshot.text;
        }

        if (snapshot.thinking !== thinking) {
          thinking = snapshot.thinking;
          send({ type: 'thinking', text: thinking });
        }
      })
        .then((snapshot) => {
          send(
            snapshot.status === 'succeeded'
              ? { type: 'done' }
              : { type: 'error', error: snapshot.error ?? 'AI generation failed' },
          );

          if (!cancelled) controller.close();
        })
        .catch((error) => {
          if (!cancelled) controller.error(error);
        })
        .finally(() => {
          signal.removeEventListener('abort', stop);
          announce();
        });
    },
    cancel() {
      cancelled = true;
    },
  });

  return new Response(body, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'X-AI-Conversation': identity.conversationId,
      'X-AI-Operation': identity.operationId,
    },
  });
};
