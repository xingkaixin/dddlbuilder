import { useCallback, useReducer, useRef } from 'react';

interface PersistenceTask {
  key: string;
  operation: string;
  // oxlint-disable-next-line anti-slop/no-unknown-returns -- queue stores completion-only producer promises without exposing their values.
  run: () => Promise<unknown>;
}

interface PendingTask {
  task: PersistenceTask;
  completion: Promise<unknown>;
}

export interface PersistenceFailure {
  id: number;
  operation: string;
}

type FailureState = { failure: PersistenceFailure | null; lastFailureId: number };

type FailureEvent = { type: 'taskFailed'; operation: string } | { type: 'allTasksRecovered' };

const failureReducer = (state: FailureState, event: FailureEvent): FailureState => {
  if (event.type === 'allTasksRecovered') return { ...state, failure: null };

  const id = state.lastFailureId + 1;

  return { failure: { id, operation: event.operation }, lastFailureId: id };
};

export function usePersistenceQueue() {
  const chainsRef = useRef(new Map<string, Promise<unknown>>());
  const pendingRef = useRef(new Map<string, PendingTask>());
  const versionsRef = useRef(new Map<string, number>());
  const failedTasksRef = useRef(new Map<string, PersistenceTask>());

  const [{ failure }, dispatchFailure] = useReducer(failureReducer, {
    failure: null,
    lastFailureId: 0,
  });
  // useReducer 没有 eager bailout；只在确有失败时派发恢复事件，避免每次成功写入都重渲染宿主组件。
  const hasFailureRef = useRef(false);

  const enqueue = useCallback(
    (
      key: string,
      operation: string,
      // oxlint-disable-next-line anti-slop/no-unknown-returns -- enqueue accepts completion-only producer promises.
      run: () => Promise<unknown>,
      { replaceable = false }: { replaceable?: boolean } = {},
    ) => {
      const pending = pendingRef.current.get(key);

      // 尚未开始的整条写入会被同 key 的新整条写入完全覆盖，只需执行最新的一次。
      if (replaceable && pending) {
        pending.task.operation = operation;
        pending.task.run = run;

        return pending.completion;
      }

      const version = (versionsRef.current.get(key) ?? 0) + 1;
      versionsRef.current.set(key, version);
      failedTasksRef.current.delete(key);

      const task: PersistenceTask = { key, operation, run };
      const previous = chainsRef.current.get(key) ?? Promise.resolve();

      const current = previous
        .catch(() => undefined)
        .then(() => {
          if (pendingRef.current.get(key)?.task === task) pendingRef.current.delete(key);

          return task.run();
        });
      chainsRef.current.set(key, current);

      if (replaceable) pendingRef.current.set(key, { task, completion: current });
      else pendingRef.current.delete(key);

      void current.then(
        () => {
          if (chainsRef.current.get(key) === current) {
            chainsRef.current.delete(key);
          }

          if (versionsRef.current.get(key) !== version) return;
          failedTasksRef.current.delete(key);

          if (failedTasksRef.current.size === 0 && hasFailureRef.current) {
            hasFailureRef.current = false;
            dispatchFailure({ type: 'allTasksRecovered' });
          }
        },
        // oxlint-disable-next-line anti-slop/no-unknown-parameters -- queued work can reject with any JavaScript value.
        (error: unknown) => {
          console.error(`[workspace-persistence] ${task.operation} failed`, error);

          if (chainsRef.current.get(key) === current) {
            chainsRef.current.delete(key);
          }

          if (versionsRef.current.get(key) !== version) return;
          failedTasksRef.current.set(key, { ...task });
          hasFailureRef.current = true;
          dispatchFailure({ type: 'taskFailed', operation: task.operation });
        },
      );

      return current;
    },
    [],
  );

  const retryFailed = useCallback(() => {
    const failedTasks = [...failedTasksRef.current.values()];

    for (const task of failedTasks) {
      void enqueue(task.key, task.operation, task.run);
    }
  }, [enqueue]);

  return { enqueue, failure, retryFailed };
}
