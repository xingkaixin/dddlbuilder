import type { AIStreamEvent } from '@ddlbuilder/shared-types';
import * as Schema from 'effect/Schema';
import {
  AIOperationIdentitySchema,
  AIConversationSnapshotSchema,
  type AIConversationRoute,
  type AIConversationSnapshot,
} from '@ddlbuilder/shared-types';
import {
  buildAuthenticatedJsonHeaders,
  getAIOperationErrorMessage,
  readAIErrorMessage,
} from './aiApi';

const STORAGE_KEY = 'ddlbuilder.ai.operations';
const StoredOperations = Schema.Array(
  Schema.Struct({
    resumeKey: Schema.String,
    operationId: Schema.String,
    conversationId: Schema.String,
  }),
);
const readResumableOperations = () => {
  try {
    return Schema.decodeUnknownSync(StoredOperations)(
      JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '[]'),
    );
  } catch {
    return [];
  }
};
const forgetAIOperation = (id: string) => {
  sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(readResumableOperations().filter((item) => item.operationId !== id)),
  );
};
export const hasResumableAIOperation = (resumeKey: string) =>
  readResumableOperations().some((item) => item.resumeKey === resumeKey);
export const stopAIOperation = async (id: string) => {
  const response = await fetch(`/api/ai/operations/${encodeURIComponent(id)}/stop`, {
    method: 'POST',
    headers: buildAuthenticatedJsonHeaders(),
    credentials: 'include',
  });

  if (!response.ok) throw new Error(await readAIErrorMessage(response, 'generationFailed'));
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

            if (snapshot.status !== 'running') return snapshot;
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

  throw new Error('AI connection interrupted.');
};

const stopOnCancel = (operationId: string, signal: AbortSignal) => {
  const stop = () => {
    if (signal.reason === 'stop' || signal.reason === 'superseded') {
      stopAIOperation(operationId).then(
        () => forgetAIOperation(operationId),
        () => undefined,
      );
    }
  };

  if (signal.aborted) stop();
  else signal.addEventListener('abort', stop, { once: true });

  return () => signal.removeEventListener('abort', stop);
};

// Detaching only stops reading; the operation must still reach the server so it can be resumed.
const ignoreDetach = (signal: AbortSignal) => {
  const controller = new AbortController();

  const forward = () => {
    if (signal.reason !== 'detach') controller.abort(signal.reason);
  };

  if (signal.aborted) forward();
  else signal.addEventListener('abort', forward, { once: true });

  return controller.signal;
};

const streamAIOperation = (
  identity: { operationId: string; conversationId: string },
  signal: AbortSignal,
  release: () => void,
) => {
  const encoder = new TextEncoder();
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
          if (!cancelled) forgetAIOperation(identity.operationId);
          send(
            snapshot.status === 'succeeded'
              ? { type: 'done' }
              : { type: 'error', error: getAIOperationErrorMessage(snapshot.error) },
          );

          if (!cancelled) controller.close();
        })
        .catch((error) => {
          if (!cancelled) controller.error(error);
        })
        .finally(release);
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

export const fetchAIConversation = async (
  route: AIConversationRoute,
  init: RequestInit,
  { conversationId, resumeKey }: { conversationId?: string; resumeKey?: string } = {},
): Promise<Response> => {
  const signal = init.signal ?? new AbortController().signal;
  const requestSignal = ignoreDetach(signal);

  const prepared = await fetch('/api/ai/operations', {
    method: 'POST',
    headers: buildAuthenticatedJsonHeaders(),
    credentials: 'include',
    signal: requestSignal,
    body: JSON.stringify({ route, conversationId }),
  });

  if (!prepared.ok) return prepared;
  const identity = Schema.decodeUnknownSync(AIOperationIdentitySchema)(await prepared.json());

  if (resumeKey) {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        [
          ...readResumableOperations().filter((item) => item.resumeKey !== resumeKey),
          { resumeKey, operationId: identity.operationId, conversationId: identity.conversationId },
        ].slice(-20),
      ),
    );
  }

  const release = stopOnCancel(identity.operationId, signal);

  const abandon = () => {
    release();
    forgetAIOperation(identity.operationId);
  };

  const submitted = await fetch(`/api/ai/operations/${identity.operationId}`, {
    ...init,
    signal: requestSignal,
    credentials: 'include',
  }).catch((error) => {
    abandon();
    throw error;
  });

  if (!submitted.ok) {
    abandon();

    return submitted;
  }

  await submitted.body?.cancel();
  signal.throwIfAborted();

  if (route === 'explain' || route === 'review' || route === 'generate-table')
    return streamAIOperation(identity, signal, release);

  try {
    const result = await observeAIOperation(identity.operationId, signal, () => undefined);
    forgetAIOperation(identity.operationId);

    if (result.status !== 'succeeded') throw new Error(getAIOperationErrorMessage(result.error));

    return Response.json(result.result, {
      headers: { 'X-AI-Conversation': identity.conversationId },
    });
  } finally {
    release();
  }
};

export const resumeAIConversation = (resumeKey: string, signal: AbortSignal) => {
  const stored = readResumableOperations().find((item) => item.resumeKey === resumeKey);

  return stored
    ? streamAIOperation(stored, signal, stopOnCancel(stored.operationId, signal))
    : null;
};
