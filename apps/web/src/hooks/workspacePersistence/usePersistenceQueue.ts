import { useCallback, useRef, useState } from 'react';

interface PersistenceTask {
  key: string;
  operation: string;
  run: () => Promise<unknown>;
}

export interface PersistenceFailure {
  id: number;
  operation: string;
}

export function usePersistenceQueue() {
  const chainsRef = useRef(new Map<string, Promise<unknown>>());
  const versionsRef = useRef(new Map<string, number>());
  const failedTasksRef = useRef(new Map<string, PersistenceTask>());
  const failureIdRef = useRef(0);
  const [failure, setFailure] = useState<PersistenceFailure | null>(null);
  const failureRef = useRef<PersistenceFailure | null>(null);

  const enqueue = useCallback((key: string, operation: string, run: () => Promise<unknown>) => {
    const version = (versionsRef.current.get(key) ?? 0) + 1;
    versionsRef.current.set(key, version);
    failedTasksRef.current.delete(key);

    const previous = chainsRef.current.get(key) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(run);
    chainsRef.current.set(key, current);

    void current.then(
      () => {
        if (chainsRef.current.get(key) === current) {
          chainsRef.current.delete(key);
        }
        if (versionsRef.current.get(key) !== version) return;
        failedTasksRef.current.delete(key);
        if (failedTasksRef.current.size === 0 && failureRef.current) {
          failureRef.current = null;
          setFailure(null);
        }
      },
      (error: unknown) => {
        console.error(`[workspace-persistence] ${operation} failed`, error);
        if (chainsRef.current.get(key) === current) {
          chainsRef.current.delete(key);
        }
        if (versionsRef.current.get(key) !== version) return;
        failedTasksRef.current.set(key, { key, operation, run });
        failureIdRef.current += 1;
        const nextFailure = { id: failureIdRef.current, operation };
        failureRef.current = nextFailure;
        setFailure(nextFailure);
      },
    );
  }, []);

  const retryFailed = useCallback(() => {
    const failedTasks = [...failedTasksRef.current.values()];
    for (const task of failedTasks) {
      enqueue(task.key, task.operation, task.run);
    }
  }, [enqueue]);

  return { enqueue, failure, retryFailed };
}
