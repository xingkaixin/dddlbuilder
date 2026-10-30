import { useCallback, useLayoutEffect, useReducer, useRef } from 'react';

type CancelReason = 'stop' | 'detach';

interface ActiveRequest {
  key?: string;
  controller: AbortController;
}

interface LatestRequestContext {
  signal: AbortSignal;
  isCurrent: () => boolean;
  commitIfCurrent: (commit: () => void) => void;
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- this boundary callback handles values thrown or supplied by external JavaScript.
function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

interface PendingState {
  resetKey: string | undefined;
  isPending: boolean;
}

type PendingEvent =
  | { type: 'started' | 'settled' }
  | { type: 'resetKeyChanged'; resetKey: string | undefined };

const idlePending = (resetKey: string | undefined): PendingState => ({
  resetKey,
  isPending: false,
});

function pendingReducer(state: PendingState, event: PendingEvent): PendingState {
  switch (event.type) {
    case 'started':
      return state.isPending ? state : { ...state, isPending: true };
    case 'settled':
      return state.isPending ? { ...state, isPending: false } : state;
    case 'resetKeyChanged':
      return idlePending(event.resetKey);
  }
}

/**
 * Runs one abortable request at a time. The active request is aborted with `resetReason` on
 * unmount and whenever `resetKey` changes.
 */
export function useLatestRequest(resetKey?: string, resetReason: CancelReason = 'stop') {
  const activeRequestRef = useRef<ActiveRequest | null>(null);
  const [pending, dispatchPending] = useReducer(pendingReducer, resetKey, idlePending);

  if (pending.resetKey !== resetKey) dispatchPending({ type: 'resetKeyChanged', resetKey });

  const cancel = useCallback((reason: CancelReason = 'stop') => {
    const activeRequest = activeRequestRef.current;

    if (!activeRequest) return false;

    activeRequestRef.current = null;
    activeRequest.controller.abort(reason);
    dispatchPending({ type: 'settled' });

    return true;
  }, []);

  // Layout timing aborts the previous key's request before the next document is painted.
  useLayoutEffect(
    () => () => {
      cancel(resetReason);
    },
    [cancel, resetKey, resetReason],
  );

  const run = useCallback(
    async <Result>(
      task: (context: LatestRequestContext) => Promise<Result>,
      key?: string,
    ): Promise<Result | null> => {
      const previousRequest = activeRequestRef.current;

      if (key !== undefined && previousRequest?.key === key) {
        return null;
      }

      previousRequest?.controller.abort('superseded');

      const activeRequest: ActiveRequest = {
        key,
        controller: new AbortController(),
      };
      activeRequestRef.current = activeRequest;
      dispatchPending({ type: 'started' });

      const isCurrent = () => activeRequestRef.current === activeRequest;

      const commitIfCurrent = (commit: () => void) => {
        if (isCurrent()) commit();
      };

      try {
        const result = await task({
          signal: activeRequest.controller.signal,
          isCurrent,
          commitIfCurrent,
        });

        return isCurrent() ? result : null;
      } catch (error) {
        if (!isCurrent() || isAbortError(error)) return null;
        throw error;
      } finally {
        if (isCurrent()) {
          activeRequestRef.current = null;
          dispatchPending({ type: 'settled' });
        }
      }
    },
    [],
  );

  return { isPending: pending.isPending, run, cancel };
}
