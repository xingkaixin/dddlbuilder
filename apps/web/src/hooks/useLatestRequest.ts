import { useCallback, useEffect, useRef, useState } from 'react';

interface ActiveRequest {
  key?: string;
  controller: AbortController;
}

interface LatestRequestContext {
  signal: AbortSignal;
  isCurrent: () => boolean;
  commitIfCurrent: (commit: () => void) => void;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export function useLatestRequest() {
  const activeRequestRef = useRef<ActiveRequest | null>(null);
  const [isPending, setIsPending] = useState(false);

  useEffect(
    () => () => {
      const activeRequest = activeRequestRef.current;
      activeRequestRef.current = null;
      activeRequest?.controller.abort();
    },
    [],
  );

  const cancel = useCallback(() => {
    const activeRequest = activeRequestRef.current;
    if (!activeRequest) return false;

    activeRequestRef.current = null;
    activeRequest.controller.abort();
    setIsPending(false);
    return true;
  }, []);

  const run = useCallback(
    async <Result>(
      task: (context: LatestRequestContext) => Promise<Result>,
      key?: string,
    ): Promise<Result | null> => {
      const previousRequest = activeRequestRef.current;
      if (key !== undefined && previousRequest?.key === key) {
        return null;
      }

      previousRequest?.controller.abort();

      const activeRequest: ActiveRequest = {
        key,
        controller: new AbortController(),
      };
      activeRequestRef.current = activeRequest;
      setIsPending(true);

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
          setIsPending(false);
        }
      }
    },
    [],
  );

  return { isPending, run, cancel };
}
